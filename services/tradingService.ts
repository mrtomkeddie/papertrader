import * as db from './database'; // Now uses Firestore-backed functions
import { TradingViewPayload, Signal, Side, Position, PositionStatus, LedgerRefType, StopLogic, Strategy, Explanation, AiTradeAction } from '../types';
import { generateExplanationText, generateFailureAnalysis, generateBeginnerExplanationText } from './geminiService';

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
    const qty = strategy.risk_per_trade_gbp / risk_per_share;

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
    const qty = riskAmountGbp / risk_per_share;

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
      risk_per_trade_gbp: riskAmountGbp,
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
        const mockPrice = lastPrice * (1 + (Math.random() - 0.5) * 0.05); // +/- 5%

        let exitPrice: number | null = null;
        let exitReason: string | null = null;

        if (pos.side === Side.LONG) {
            if (mockPrice <= pos.stop_price) {
                exitPrice = pos.stop_price;
                exitReason = "Stop loss hit";
            } else if (mockPrice >= pos.tp_price) {
                exitPrice = pos.tp_price;
                exitReason = "Take profit hit";
            }
        } else { // SHORT
            if (mockPrice >= pos.stop_price) {
                exitPrice = pos.stop_price;
                exitReason = "Stop loss hit";
            } else if (mockPrice <= pos.tp_price) {
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