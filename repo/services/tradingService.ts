import * as db from './database'; // Now uses Firestore-backed functions
import { TradingViewPayload, Signal, Side, Position, PositionStatus, LedgerRefType, StopLogic, Strategy, Explanation, AiTradeAction } from '../types';
import { generateExplanationText, generateFailureAnalysis, generateBeginnerExplanationText } from './geminiService';

// Simple ATR calculator for close-only trailing
const calcATR = (bars: Array<{ high: number; low: number; close: number }>, period = 14): number => {
  if (!Array.isArray(bars) || bars.length < period + 1) return NaN;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const b = bars[i];
    const prevClose = bars[i - 1]?.close;
    if (!Number.isFinite(b.high) || !Number.isFinite(b.low) || !Number.isFinite(prevClose)) return NaN;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
    sum += tr;
  }
  return sum / period;
};

export const handleWebhook = async (payload: TradingViewPayload): Promise<{success: boolean, message: string}> => {
    // Idempotency check
    const existingSignals = await db.getSignals(); // Await getSignals
    const existingSignal = existingSignals.find(s => s.symbol === payload.symbol && s.bar_time === payload.bar_time && s.side === payload.signal);
    if (existingSignal) {
        return { success: false, message: "Duplicate signal received. Ignoring." };
    }

    // Find active strategy
    const strategies = await db.getStrategies(); // Await getStrategies
    const strategy = strategies.find(s => s.symbol === payload.symbol && s.enabled);
    if (!strategy) {
        return { success: false, message: `No active strategy found for symbol ${payload.symbol}`};
    }

    const side = payload.signal === "LONG" ? Side.LONG : Side.SHORT;
    const now = new Date().toISOString();

    // Store signal
    const newSignal: Omit<Signal, 'id'> = {
        ts: now,
        symbol: payload.symbol,
        side: side,
        bar_time: payload.bar_time,
        price_tv: payload.close,
        atr: payload.atr,
        strategy_id: strategy.id,
        raw_payload: JSON.stringify(payload)
    };
    const addedSignal = await db.addSignal(newSignal); // Await addSignal

    // Calculate trade parameters
    const slippageFactor = (strategy.slippage_bps + strategy.fee_bps) / 10000;
    const entry_price = side === Side.LONG
        ? payload.close * (1 + slippageFactor)
        : payload.close * (1 - slippageFactor);

    let stop_price: number;
    if (strategy.stop_logic === StopLogic.ATR) {
        stop_price = side === Side.LONG
            ? entry_price - (strategy.atr_mult * payload.atr)
            : entry_price + (strategy.atr_mult * payload.atr);
    } else { // Fallback for SWING
        const buffer = entry_price * 0.01;
        stop_price = side === Side.LONG ? entry_price - buffer : entry_price + buffer;
    }

    const risk_per_share = Math.abs(entry_price - stop_price);
    if (risk_per_share === 0) {
      return { success: false, message: "Risk per share is zero, cannot open position."};
    }
    // Lot-based sizing for gold (client-side simulation): 0.01 lot min
    const accountGbp = Number(import.meta.env.VITE_AUTOPILOT_ACCOUNT_GBP ?? 250);
    const riskPct = Number(import.meta.env.VITE_AUTOPILOT_RISK_PCT ?? 0.02);
    const stopDistance = Math.abs(entry_price - stop_price);
    let lotSize = (accountGbp * riskPct) / (stopDistance * 100);
    lotSize = Math.max(0.01, lotSize);
    const qty = lotSize * 100;

    const tp_price = side === Side.LONG
        ? entry_price + (strategy.take_profit_R * risk_per_share)
        : entry_price - (strategy.take_profit_R * risk_per_share);

    // Create position
    const newPosition: Omit<Position, 'id'> = {
        status: PositionStatus.OPEN,
        side,
        symbol: payload.symbol,
        entry_ts: now,
        entry_price,
        qty,
        stop_price,
        initial_stop_price: stop_price,
        stop_change_logs: [],
        tp_price,
        exit_ts: null,
        exit_price: null,
        pnl_gbp: null,
        R_multiple: null,
        strategy_id: strategy.id,
        signal_id: addedSignal.id,
        slippage_bps: strategy.slippage_bps,
        fee_bps: strategy.fee_bps,
        method_name: strategy.name,
    };
    const addedPosition = await db.addPosition(newPosition); // Await addPosition

    // Generate explanations (standard + beginner)
    const [explanationText, beginnerText] = await Promise.all([
      generateExplanationText(addedPosition, strategy),
      generateBeginnerExplanationText(addedPosition, strategy)
    ]);
    const newExplanation: Omit<Explanation, 'id'> = {
      position_id: addedPosition.id,
      plain_english_entry: explanationText,
      beginner_friendly_entry: beginnerText,
      exit_reason: null,
    };
    await db.addExplanation(newExplanation); // Await addExplanation

    // Ledger entry for fee
    const fee = payload.close * qty * (strategy.fee_bps / 10000);
    await db.addLedgerEntry({ // Await addLedgerEntry
      ts: now,
      delta_gbp: -fee,
      cash_after: 0, // will be calculated in addLedgerEntry
      ref_type: LedgerRefType.FEE,
      ref_id: addedPosition.id,
    });
    
    return { success: true, message: `Position ${addedPosition.id} opened for ${payload.symbol}`};
};

export const executeAiTrade = async (trade: NonNullable<AiTradeAction['trade']>, symbol: string, riskAmountGbp: number): Promise<{success: boolean, message: string}> => {
    const now = new Date().toISOString();

    const slippageFactor = (trade.slippage_bps + trade.fee_bps) / 10000;
    const entry_price = trade.side === Side.LONG
        ? trade.entry_price * (1 + slippageFactor)
        : trade.entry_price * (1 - slippageFactor);

    const risk_per_share = Math.abs(entry_price - trade.stop_price);
     if (risk_per_share === 0) {
      return { success: false, message: "Risk per share is zero, cannot open position."};
    }
    // Use dynamic account balance: base account + latest ledger cash_after
    const baseAccountGbp = Number(import.meta.env.VITE_AUTOPILOT_ACCOUNT_GBP ?? 250);
    const riskPct = Number(import.meta.env.VITE_AUTOPILOT_RISK_PCT ?? 0.02);
    let latestCash = 0;
    try {
      const ledger = await db.getLedger();
      latestCash = ledger.length ? ledger[ledger.length - 1].cash_after : 0;
    } catch {}
    const accountGbp = baseAccountGbp + latestCash;
    const stopDistance = Math.abs(entry_price - trade.stop_price);
    let lotSize = (accountGbp * riskPct) / (stopDistance * 100);
    lotSize = Math.max(0.01, lotSize);
    const qty = lotSize * 100;

    const newPosition: Omit<Position, 'id'> = {
        status: PositionStatus.OPEN,
        side: trade.side,
        symbol: symbol, // Use the symbol from the chart
        entry_ts: now,
        entry_price: entry_price,
        qty,
        stop_price: trade.stop_price,
        tp_price: trade.tp_price,
        exit_ts: null,
        exit_price: null,
        pnl_gbp: null,
        R_multiple: null,
        strategy_id: "ai-generated", // Special ID for AI trades
        signal_id: `ai-${crypto.randomUUID()}`, // Mark as an AI signal
        slippage_bps: trade.slippage_bps,
        fee_bps: trade.fee_bps,
        method_name: trade.strategy_type,
    };
    const addedPosition = await db.addPosition(newPosition); // Await addPosition

    const beginnerText = await generateBeginnerExplanationText(addedPosition, {
      id: 'ai-generated',
      name: trade.strategy_type,
      symbol,
      timeframe: trade.suggested_timeframe || '1H',
      risk_per_trade_gbp: Math.round(accountGbp * riskPct),
      stop_logic: (trade.strategy_type?.toUpperCase().includes('SWING') ? StopLogic.SWING : StopLogic.ATR),
      atr_mult: 1.5,
      take_profit_R: Math.max(1.5, trade.risk_reward_ratio || 2),
      slippage_bps: trade.slippage_bps,
      fee_bps: trade.fee_bps,
      enabled: true,
    }, trade.reason);

    const newExplanation: Omit<Explanation, 'id'> = {
      position_id: addedPosition.id,
      plain_english_entry: `AI Trade (${trade.strategy_type}): ${trade.reason}`,
      beginner_friendly_entry: beginnerText,
      exit_reason: null,
    };
    await db.addExplanation(newExplanation); // Await addExplanation

    const fee = entry_price * qty * (trade.fee_bps / 10000);
    await db.addLedgerEntry({ // Await addLedgerEntry
      ts: now,
      delta_gbp: -fee,
      cash_after: 0,
      ref_type: LedgerRefType.FEE,
      ref_id: addedPosition.id,
    });

    return { success: true, message: `AI Position ${addedPosition.id} opened for ${symbol}`};
}

// Simulated price update and exit logic
export const runPriceCheck = async () => {
    const openPositions = await db.getOpenPositions(); // Await getOpenPositions
    if (openPositions.length === 0) return;

    const closingPromises = openPositions.map(async pos => {
        // In a real app, you'd fetch the latest price. Here we simulate.
        // We'll use the last signal price for the symbol as a base.
        const signalsForSymbol = (await db.getSignals()).filter(s => s.symbol === pos.symbol).sort((a,b) => b.bar_time - a.bar_time); // Await getSignals
        const lastPrice = signalsForSymbol.length > 0 ? signalsForSymbol[0].price_tv : pos.entry_price;
        
        // Simulate a random price movement for checking
        const currentPrice = lastPrice * (1 + (Math.random() - 0.5) * 0.05); // +/- 5%

        // Close-only multi-stage trailing (BE, LOCK, ATR) in client-side simulation
        try {
          const tf = (import.meta.env.VITE_AUTOPILOT_TRAIL_TF as string) || '15m';
          let timeframe = tf;
          try {
            const { TIMEFRAME_BY_SYMBOL } = await import('../constants');
            timeframe = TIMEFRAME_BY_SYMBOL[pos.symbol] || tf;
          } catch {}
          const { fetchOHLCV } = await import('./dataService');
          const ohlcv = await fetchOHLCV(pos.symbol, timeframe, 150);
          const latestClose = ohlcv[ohlcv.length - 1]?.close ?? currentPrice;
          const initialRisk = pos.initial_stop_price != null
            ? (pos.side === Side.LONG ? (pos.entry_price - pos.initial_stop_price) : (pos.initial_stop_price - pos.entry_price))
            : (pos.side === Side.LONG ? (pos.entry_price - pos.stop_price) : (pos.stop_price - pos.entry_price));
          const risk = initialRisk;
          if (risk > 0 && Number.isFinite(latestClose)) {
            const isLong = pos.side === Side.LONG;
            const rNow = isLong
              ? (latestClose - pos.entry_price) / risk
              : (pos.entry_price - latestClose) / risk;

            // Stage 1: Break-even with absolute buffer
            const breakEvenR = Number(import.meta.env.VITE_AUTOPILOT_BREAK_EVEN_R ?? 1);
            let beAbs = import.meta.env.VITE_AUTOPILOT_BE_BUFFER_ABS ? Number(import.meta.env.VITE_AUTOPILOT_BE_BUFFER_ABS) : (/XAU/i.test(pos.symbol) ? 0.05 : 0.0004);
            if (!Number.isFinite(beAbs) || beAbs < 0) beAbs = 0;
            let beCandidate: number | null = null;
            const beTarget = isLong ? (pos.entry_price + beAbs) : (pos.entry_price - beAbs);
            const beNeedsMove = isLong ? (pos.stop_price < beTarget) : (pos.stop_price > beTarget);
            if (rNow >= breakEvenR && beNeedsMove) beCandidate = beTarget;

            // Stage 2: Lock profit at +1.5R → stop = entry ± 0.5R
            const lockR = Number(import.meta.env.VITE_AUTOPILOT_LOCK_R ?? 1.5);
            const lockOffsetR = Number(import.meta.env.VITE_AUTOPILOT_LOCK_OFFSET_R ?? 0.5);
            let lockCandidate: number | null = null;
            if (rNow >= lockR) {
              const lockStop = isLong ? (pos.entry_price + lockOffsetR * risk) : (pos.entry_price - lockOffsetR * risk);
              const lockTighten = isLong ? (lockStop > pos.stop_price) : (lockStop < pos.stop_price);
              if (lockTighten) lockCandidate = lockStop;
            }

            // Stage 3: ATR trail at ≥ 2R → close −/+ ATR_MULT × ATR(14)
            const atrStartR = Number(import.meta.env.VITE_AUTOPILOT_ATR_START_R ?? 2);
            const atrMult = Number(import.meta.env.VITE_AUTOPILOT_ATR_MULT ?? 1.2);
            let atrCandidate: number | null = null;
            if (rNow >= atrStartR && atrMult > 0) {
              const atr = calcATR(ohlcv, 14);
              if (Number.isFinite(atr) && atr > 0) {
                const atrStop = isLong ? (latestClose - atrMult * atr) : (latestClose + atrMult * atr);
                const atrTighten = isLong ? (atrStop > pos.stop_price) : (atrStop < pos.stop_price);
                if (atrTighten) atrCandidate = atrStop;
              }
            }

            // Choose the tightest candidate that still tightens the stop
            let finalCandidate: number | null = null;
            let stage: 'BE' | 'LOCK' | 'ATR' | null = null;
            if (isLong) {
              const best = Math.max(pos.stop_price, beCandidate ?? -Infinity, lockCandidate ?? -Infinity, atrCandidate ?? -Infinity);
              if (best > pos.stop_price) {
                finalCandidate = best;
                stage = (best === (atrCandidate ?? -Infinity)) ? 'ATR' : (best === (lockCandidate ?? -Infinity)) ? 'LOCK' : 'BE';
              }
            } else {
              const best = Math.min(pos.stop_price, beCandidate ?? Infinity, lockCandidate ?? Infinity, atrCandidate ?? Infinity);
              if (best < pos.stop_price) {
                finalCandidate = best;
                stage = (best === (atrCandidate ?? Infinity)) ? 'ATR' : (best === (lockCandidate ?? Infinity)) ? 'LOCK' : 'BE';
              }
            }

            if (finalCandidate != null && stage) {
              const log = { ts: new Date().toISOString(), old_stop: pos.stop_price, new_stop: finalCandidate, stage };
              await db.updatePosition({ ...pos, stop_price: finalCandidate, stop_change_logs: [...(pos.stop_change_logs ?? []), log] });
            }
          }
        } catch (err) {
          console.warn('[Client] Trailing stop adjustment failed:', err);
        }

        let exitPrice: number | null = null;
        let exitReason: string | null = null;

        if (pos.side === Side.LONG) {
            if (currentPrice <= pos.stop_price) {
                exitPrice = pos.stop_price;
                exitReason = "Stop loss hit";
            } else if (currentPrice >= pos.tp_price) {
                exitPrice = pos.tp_price;
                exitReason = "Take profit hit";
            }
        } else { // SHORT
            if (currentPrice >= pos.stop_price) {
                exitPrice = pos.stop_price;
                exitReason = "Stop loss hit";
            } else if (currentPrice <= pos.tp_price) {
                exitPrice = pos.tp_price;
                exitReason = "Take profit hit";
            }
        }

        if (exitPrice !== null && exitReason !== null) {
            await closePosition(pos, exitPrice, exitReason);
        }
    });
    
    await Promise.all(closingPromises);
}

// Close position and update DB
const closePosition = async (position: Position, exitPrice: number, reason: string) => {
    const now = new Date().toISOString();

    const pnl_gbp = position.side === Side.LONG
        ? (exitPrice - position.entry_price) * position.qty
        : (position.entry_price - exitPrice) * position.qty;

    const R_multiple = position.side === Side.LONG
        ? (exitPrice - position.entry_price) / (position.entry_price - position.stop_price)
        : (position.entry_price - exitPrice) / (position.stop_price - position.entry_price);

    const updatedPosition: Position = {
        ...position,
        status: PositionStatus.CLOSED,
        exit_ts: now,
        exit_price: exitPrice,
        pnl_gbp,
        R_multiple,
    };

    await db.updatePosition(updatedPosition); // Await updatePosition

    await db.addLedgerEntry({ // Await addLedgerEntry
        ts: now,
        delta_gbp: pnl_gbp,
        cash_after: 0,
        ref_type: LedgerRefType.EXIT,
        ref_id: position.id,
    });

    // Add failure analysis if losing trade
    if (pnl_gbp < 0) {
      const expl = await db.getExplanationByPositionId(position.id); // Await getExplanationByPositionId
      if (expl) {
        const failureAnalysis = await generateFailureAnalysis(position, expl);
        await db.updateExplanation({ ...expl, exit_reason: failureAnalysis }); // Await updateExplanation
      }
    }
}