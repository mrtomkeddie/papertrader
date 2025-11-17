import * as db from './adminDatabase';
import { AiTradeAction, Side, Position, PositionStatus, LedgerRefType, Explanation } from '../types';
import { generateExplanationText, generateFailureAnalysis, generateBeginnerExplanationText } from '../services/geminiService';
import { sendPushNotificationToAll } from './notificationService';
import { fetchOHLCV } from '../services/dataService';
import { TIMEFRAME_BY_SYMBOL, BREAK_EVEN_R_BY_SYMBOL, LOCK_R_BY_SYMBOL, LOCK_OFFSET_R_BY_SYMBOL, ATR_TRAIL_START_R_BY_SYMBOL, ATR_MULT_BY_SYMBOL } from '../constants';
import { calculateVWAP } from '../strategies/indicators';
import { mapOandaSymbol, placeMarketOrder, closeTrade, getInstrumentMidPrice, updateStopLoss, getInstrumentCandles, closeTradeUnits, getInstrumentQuote, getInstrumentAverageSpread } from './broker/oanda';
import { isWithinUsdNewsLockWindow } from '../services/newsService';

export const executeAiTrade = async (
  trade: NonNullable<AiTradeAction['trade']>,
  symbol: string,
  riskAmountGbp: number,
  strategyId?: string
): Promise<{ success: boolean; message: string }> => {
  const now = new Date().toISOString();

  // Optional: enforce single open position at a time (disabled by default)
  const enforceSingle = ((process.env.AUTOPILOT_SINGLE_POSITION || process.env.VITE_AUTOPILOT_SINGLE_POSITION || 'false') as string).toLowerCase() === 'true';
  if (enforceSingle) {
    const currentlyOpen = await db.getOpenPositions();
    if (currentlyOpen.length > 0) {
      return { success: false, message: 'Single-position risk rule: an open position already exists.' };
    }
  }

  // Volatility clamp using ATR% on suggested timeframe
  let riskPctEff: number | undefined; // set below after reading baseline
  try {
    const tf = trade.suggested_timeframe && typeof trade.suggested_timeframe === 'string' ? trade.suggested_timeframe : '1h';
    const ohlcv = await fetchOHLCV(symbol, tf, 60);
    if (ohlcv.length >= 15) {
      // Compute ATR(14)
      const tr: number[] = [];
      for (let i = 0; i < ohlcv.length; i++) {
        if (i === 0) {
          tr.push(ohlcv[i].high - ohlcv[i].low);
        } else {
          const tr1 = ohlcv[i].high - ohlcv[i].low;
          const tr2 = Math.abs(ohlcv[i].high - ohlcv[i-1].close);
          const tr3 = Math.abs(ohlcv[i].low - ohlcv[i-1].close);
          tr.push(Math.max(tr1, tr2, tr3));
        }
      }
      const period = 14;
      let atr: number[] = [];
      let sum = tr.slice(0, period).reduce((acc, v) => acc + v, 0);
      atr.push(...Array(period - 1).fill(NaN), sum / period);
      for (let i = period; i < tr.length; i++) {
        const current = (atr[i-1] * (period - 1) + tr[i]) / period;
        atr.push(current);
      }
      const latestClose = ohlcv[ohlcv.length - 1].close;
      const latestAtr = atr[atr.length - 1];
      const atrPercent = (latestAtr / latestClose) * 100;
      if (atrPercent < 0.25) {
        return { success: false, message: `ATR% ${atrPercent.toFixed(2)} < 0.25%; skipping low-volatility trade.` };
      }
      // If ATR% too high, reduce risk percent (will apply below)
      if (atrPercent > 1.0) {
        riskPctEff = 'halve'; // marker, compute after baseline
      }
    }
  } catch (volErr) {
    // If ATR fetch fails, proceed without clamp
    console.warn('[TradingAdmin] ATR clamp failed; proceeding without volatility guard:', volErr);
  }

  const slippageFactor = (trade.slippage_bps + trade.fee_bps) / 10000;
  const entry_price = trade.side === Side.LONG
    ? trade.entry_price * (1 + slippageFactor)
    : trade.entry_price * (1 - slippageFactor);

  const risk_per_share = Math.abs(entry_price - trade.stop_price);
  if (risk_per_share === 0) {
    return { success: false, message: 'Risk per share is zero, cannot open position.' };
  }
  // Percent-of-account sizing with ATR scaling
  const baseAccountGbp = Number(process.env.AUTOPILOT_ACCOUNT_GBP ?? process.env.VITE_AUTOPILOT_ACCOUNT_GBP ?? '250');
  const riskPctBase = Number(process.env.AUTOPILOT_RISK_PCT ?? process.env.VITE_AUTOPILOT_RISK_PCT ?? '0.02');
  let latestCash = 0;
  try {
    // Read latest ledger balance to reflect realized P/L
    const lastSnap = await (await import('./firebaseAdmin')).adminDb.collection('ledger').orderBy('ts', 'desc').limit(1).get();
    latestCash = lastSnap.empty ? 0 : (lastSnap.docs[0].data() as any).cash_after ?? 0;
  } catch {}
  const accountGbp = baseAccountGbp + latestCash;
  const stopDistance = Math.abs(entry_price - trade.stop_price);
  let riskPct = riskPctBase;
  if (riskPctEff === 'halve') riskPct = riskPctBase / 2;
  let lotSize = (accountGbp * riskPct) / (stopDistance * 100);
  lotSize = Math.max(0.01, lotSize);
  const qty = lotSize * 100; // position units

  // Spread filter (requires OANDA pricing)
  const broker = (process.env.AUTOPILOT_BROKER || process.env.VITE_AUTOPILOT_BROKER || '').toLowerCase();
  const hasOandaCreds = (process.env.OANDA_API_TOKEN || process.env.VITE_OANDA_API_TOKEN);
  if (broker === 'oanda' && hasOandaCreds) {
    try {
      const instrument = mapOandaSymbol(symbol);
      const quote = await getInstrumentQuote(instrument);
      const gran = 'M1';
      const avgSpread = await getInstrumentAverageSpread(instrument, gran, 20);
      const currentSpread = quote.ask - quote.bid;
      const spreadMult = Number(process.env.SPREAD_FILTER_MULT ?? process.env.VITE_SPREAD_FILTER_MULT ?? '1.2');
      if (Number.isFinite(avgSpread) && Number.isFinite(currentSpread) && currentSpread > spreadMult * avgSpread) {
        return { success: false, message: `Spread filter: ${currentSpread.toFixed(5)} > ${spreadMult}× avg ${avgSpread.toFixed(5)}` };
      }
    } catch (err) {
      console.warn('[TradingAdmin] Spread filter failed; continuing without spread guard:', err);
    }
  }

  // News filter: skip 15m before/after high-impact USD news
  try {
    const nowDate = new Date();
    const locked = await isWithinUsdNewsLockWindow(nowDate);
    if (locked) {
      return { success: false, message: 'News filter: within 15m of high-impact USD event' };
    }
  } catch (err) {
    console.warn('[TradingAdmin] News filter check failed; proceeding:', err);
  }

  const newPosition: Omit<Position, 'id'> = {
    status: PositionStatus.OPEN,
    side: trade.side,
    symbol,
    entry_ts: now,
    entry_price,
    qty,
    stop_price: trade.stop_price,
    initial_stop_price: trade.stop_price,
    stop_change_logs: [],
    tp_price: trade.tp_price,
    exit_ts: null,
    exit_price: null,
    pnl_gbp: null,
    R_multiple: null,
    strategy_id: strategyId || 'ai-generated',
    signal_id: `ai-${crypto.randomUUID()}`,
    slippage_bps: trade.slippage_bps,
    fee_bps: trade.fee_bps,
    method_name: strategyId || trade.strategy_type,
  };

  // If broker integration is enabled, try real order on OANDA (practice by default)
  const broker2 = (process.env.AUTOPILOT_BROKER || process.env.VITE_AUTOPILOT_BROKER || '').toLowerCase();
  if (broker2 === 'oanda' && (process.env.OANDA_API_TOKEN || process.env.VITE_OANDA_API_TOKEN)) {
    try {
      const instrument = mapOandaSymbol(symbol);
      const isLong = newPosition.side === Side.LONG;
      const units = isLong ? newPosition.qty : -newPosition.qty;
      const { tradeID, price } = await placeMarketOrder(
        instrument,
        units,
        newPosition.stop_price,
        newPosition.tp_price,
        `papertrader-${newPosition.method_name}`
      );
      if (price && Number.isFinite(price)) newPosition.entry_price = price;
      if (tradeID) newPosition.signal_id = `oanda-${tradeID}`;
    } catch (err) {
      console.warn('[TradingAdmin] OANDA order error; proceeding with simulated entry:', err);
    }
  }

  const addedPosition = await db.addPosition(newPosition);

  const strategyForText = {
    id: strategyId || 'ai-generated',
    name: trade.strategy_type,
    symbol,
    timeframe: trade.suggested_timeframe || '1H',
    risk_per_trade_gbp: Math.round(accountGbp * riskPct),
    stop_logic: (trade.strategy_type?.toUpperCase().includes('SWING') ? 'SWING' : 'ATR') as any,
    atr_mult: 1.5,
    take_profit_R: Math.max(1.5, trade.risk_reward_ratio || 2),
    slippage_bps: trade.slippage_bps,
    fee_bps: trade.fee_bps,
    enabled: true,
  } as any;

  const explanationText = await generateExplanationText(addedPosition, strategyForText, trade.reason);
  const beginnerText = await generateBeginnerExplanationText(addedPosition, strategyForText, trade.reason);

  const newExplanation: Omit<Explanation, 'id'> = {
    position_id: addedPosition.id,
    plain_english_entry: explanationText,
    beginner_friendly_entry: beginnerText,
    exit_reason: null,
  };
  await db.addExplanation(newExplanation);

  const fee = entry_price * qty * (trade.fee_bps / 10000);
  await db.addLedgerEntry({
    ts: now,
    delta_gbp: -fee,
    ref_type: LedgerRefType.FEE,
    ref_id: addedPosition.id,
  });

  await sendPushNotificationToAll(
    `New Trade Opened`,
    `Opened ${trade.side} position on ${symbol} at ${entry_price.toFixed(2)}`,
    { positionId: addedPosition.id }
  );

  return { success: true, message: `AI Position ${addedPosition.id} opened for ${symbol}` };
};

export const runPriceCheckAdmin = async () => {
  const openPositions = await db.getOpenPositions();
  if (openPositions.length === 0) return;

  const signals = await db.getSignals();

  const closingPromises = openPositions.map(async pos => {
    const signalsForSymbol = signals.filter(s => s.symbol === pos.symbol).sort((a, b) => b.bar_time - a.bar_time);
    const lastPrice = signalsForSymbol.length > 0 ? signalsForSymbol[0].price_tv : pos.entry_price;
    
    // Use real price for OANDA-backed trades, fallback to simulated movement otherwise
    let currentPrice = lastPrice * (1 + (Math.random() - 0.5) * 0.05);
    const hasOandaCreds = (process.env.OANDA_API_TOKEN || process.env.VITE_OANDA_API_TOKEN);
    const isOanda = pos.signal_id?.startsWith('oanda-');
    if (hasOandaCreds) {
      try {
        const instrument = mapOandaSymbol(pos.symbol);
        currentPrice = await getInstrumentMidPrice(instrument);
      } catch (err) {
        console.warn('[TradingAdmin] OANDA pricing failed; using simulated price:', err);
      }
    }

    // Close-only trailing: fetch execution timeframe OHLCV and drive all stages from latest close
    try {
      const tf = TIMEFRAME_BY_SYMBOL[pos.symbol] ?? (process.env.AUTOPILOT_TRAIL_TF || process.env.VITE_AUTOPILOT_TRAIL_TF || '15m');
      let ohlcv = [] as ReturnType<typeof fetchOHLCV> extends Promise<infer T> ? T : any;
      let latestClose: number | undefined;
      // Prefer OANDA candles for execution-time logic when creds available
      if (hasOandaCreds) {
        try {
          const instrument = mapOandaSymbol(pos.symbol);
          const gran = tf.toLowerCase() === '15m' ? 'M15' : tf.toLowerCase().startsWith('1h') ? 'H1' : 'M15';
          ohlcv = await getInstrumentCandles(instrument, gran as any, 150);
          latestClose = ohlcv[ohlcv.length - 1]?.close;
        } catch (err) {
          console.warn('[TradingAdmin] OANDA candles failed; falling back:', err);
        }
      }
      if (!ohlcv.length) {
        ohlcv = await fetchOHLCV(pos.symbol, tf, 150);
        latestClose = ohlcv[ohlcv.length - 1]?.close;
      }
      if (!Number.isFinite(latestClose)) latestClose = currentPrice;

      const breakEvenR = BREAK_EVEN_R_BY_SYMBOL[pos.symbol] ?? Number(process.env.AUTOPILOT_BREAK_EVEN_R ?? process.env.VITE_AUTOPILOT_BREAK_EVEN_R ?? '1');
      const initialRisk = pos.initial_stop_price != null
        ? (pos.side === Side.LONG ? (pos.entry_price - pos.initial_stop_price) : (pos.initial_stop_price - pos.entry_price))
        : (pos.side === Side.LONG ? (pos.entry_price - pos.stop_price) : (pos.stop_price - pos.entry_price));
      const risk = initialRisk;
      if (risk > 0) {
        const rNow = pos.side === Side.LONG
          ? (latestClose - pos.entry_price) / risk
          : (pos.entry_price - latestClose) / risk;

        // Stage TP1 — at +1.5R: close 50%, move SL to break-even
        const tp1Done = (pos.stop_change_logs ?? []).some(l => l.stage === 'TP1CLOSE');
        if (!tp1Done && rNow >= breakEvenR) {
          try {
            const closeUnits = Math.round(pos.qty * 0.5);
            if (closeUnits > 0) {
              // Real broker partial close if applicable
              if (isOanda) {
                const tradeID = pos.signal_id.replace('oanda-', '');
                try { await closeTradeUnits(tradeID, closeUnits); } catch (err) {
                  console.warn('[TradingAdmin] OANDA partial close (TP1) failed:', err);
                }
              }
              // Ledger P&L for partial close
              const partialPnl = pos.side === Side.LONG
                ? (latestClose - pos.entry_price) * closeUnits
                : (pos.entry_price - latestClose) * closeUnits;
              await db.addLedgerEntry({ ts: new Date().toISOString(), delta_gbp: partialPnl, ref_type: LedgerRefType.EXIT, ref_id: pos.id });

              // Update position: reduce qty
              let beStop = pos.entry_price; // exact break-even per spec
              const log1 = { ts: new Date().toISOString(), old_stop: pos.stop_price, new_stop: beStop, stage: 'BE' };
              const log2 = { ts: new Date().toISOString(), old_stop: beStop, new_stop: beStop, stage: 'TP1CLOSE' };
              const updated = { ...pos, qty: pos.qty - closeUnits, stop_price: beStop, stop_change_logs: [...(pos.stop_change_logs ?? []), log1, log2] };
              await db.updatePosition(updated);
              if (isOanda) {
                const tradeID = pos.signal_id.replace('oanda-', '');
                try { await updateStopLoss(tradeID, beStop); } catch (err) {
                  console.warn('[TradingAdmin] OANDA BE stop update failed:', err);
                }
              }
              await sendPushNotificationToAll('TP1: 50% Closed + BE', `Closed 50% on ${pos.symbol} at ~${latestClose?.toFixed(5)} and moved stop to BE`, { positionId: pos.id });
            }
          } catch (err) {
            console.warn('[TradingAdmin] TP1 partial close failed:', err);
          }
        }

        // Stage TP2 — at +3R: close 25% (half of remaining), start ATR trailing thereafter
        const tp2Done = (pos.stop_change_logs ?? []).some(l => l.stage === 'TP2CLOSE');
        const atrStartR = ATR_TRAIL_START_R_BY_SYMBOL[pos.symbol] ?? Number(process.env.AUTOPILOT_ATR_TRAIL_START_R ?? process.env.VITE_AUTOPILOT_ATR_TRAIL_START_R ?? '3');
        const atrMult = ATR_MULT_BY_SYMBOL[pos.symbol] ?? Number(process.env.AUTOPILOT_ATR_MULT ?? process.env.VITE_AUTOPILOT_ATR_MULT ?? '1.5');
        if (!tp2Done && rNow >= 3.0) {
          try {
            const closeUnits = Math.round(pos.qty * 0.5); // leave ~25% of original
            if (closeUnits > 0) {
              if (isOanda) {
                const tradeID = pos.signal_id.replace('oanda-', '');
                try { await closeTradeUnits(tradeID, closeUnits); } catch (err) {
                  console.warn('[TradingAdmin] OANDA partial close (TP2) failed:', err);
                }
              }
              const partialPnl = pos.side === Side.LONG
                ? (latestClose - pos.entry_price) * closeUnits
                : (pos.entry_price - latestClose) * closeUnits;
              await db.addLedgerEntry({ ts: new Date().toISOString(), delta_gbp: partialPnl, ref_type: LedgerRefType.EXIT, ref_id: pos.id });

              const log = { ts: new Date().toISOString(), old_stop: pos.stop_price, new_stop: pos.stop_price, stage: 'TP2CLOSE' };
              const updated = { ...pos, qty: pos.qty - closeUnits, stop_change_logs: [...(pos.stop_change_logs ?? []), log] };
              // Set TP very far to avoid premature closure; rely on ATR trailing thereafter
              const farTp = pos.side === Side.LONG ? (pos.entry_price + Math.abs(pos.entry_price) * 1000) : (pos.entry_price - Math.abs(pos.entry_price) * 1000);
              (updated as any).tp_price = farTp;
              await db.updatePosition(updated);
              await sendPushNotificationToAll('TP2: 25% Closed + ATR Start', `Closed 25% (half remaining) on ${pos.symbol} at ~${latestClose?.toFixed(5)} and started ATR trailing`, { positionId: pos.id });
            }
          } catch (err) {
            console.warn('[TradingAdmin] TP2 partial close failed:', err);
          }
        }

        // ATR trailing: stop = max(current_stop, close ± m*ATR)
        if (rNow >= atrStartR && atrMult > 0) {
          try {
            if (ohlcv.length >= 15) {
              // ATR(14)
              const tr: number[] = [];
              for (let i = 0; i < ohlcv.length; i++) {
                if (i === 0) tr.push(ohlcv[i].high - ohlcv[i].low);
                else {
                  const tr1 = ohlcv[i].high - ohlcv[i].low;
                  const tr2 = Math.abs(ohlcv[i].high - ohlcv[i-1].close);
                  const tr3 = Math.abs(ohlcv[i].low - ohlcv[i-1].close);
                  tr.push(Math.max(tr1, tr2, tr3));
                }
              }
              const period = 14;
              let atr: number[] = [];
              let sum = tr.slice(0, period).reduce((acc, v) => acc + v, 0);
              atr.push(...Array(period - 1).fill(NaN), sum / period);
              for (let i = period; i < tr.length; i++) {
                const current = (atr[i-1] * (period - 1) + tr[i]) / period;
                atr.push(current);
              }
              const latestAtr = atr[atr.length - 1];
              const candidate = pos.side === Side.LONG
                ? latestClose - atrMult * latestAtr
                : latestClose + atrMult * latestAtr;
              const shouldTrail = pos.side === Side.LONG ? (candidate > pos.stop_price) : (candidate < pos.stop_price);
              if (shouldTrail) {
                const log = { ts: new Date().toISOString(), old_stop: pos.stop_price, new_stop: candidate, stage: 'ATR' };
                const updated = { ...pos, stop_price: candidate, stop_change_logs: [...(pos.stop_change_logs ?? []), log] };
                await db.updatePosition(updated);
                if (isOanda) {
                  const tradeID = pos.signal_id.replace('oanda-', '');
                  try { await updateStopLoss(tradeID, candidate); } catch (err) {
                    console.warn('[TradingAdmin] OANDA ATR stop update failed:', err);
                  }
                }
                console.log(`[TradingAdmin] ATR trail moved on ${pos.symbol}: rNow=${rNow.toFixed(2)} >= atrStartR=${atrStartR.toFixed(2)}, atrMult=${atrMult.toFixed(2)}`);
                await sendPushNotificationToAll(
                  'Trailing Stop Updated (ATR)',
                  `Trailing stop on ${pos.symbol} set to ${candidate.toFixed(5)}`,
                  { positionId: pos.id }
                );
              }
            }
          } catch (err) {
            console.warn('[TradingAdmin] ATR trailing failed:', err);
          }
        } else {
          const reason = rNow < atrStartR
            ? `rNow=${rNow.toFixed(2)} < atrStartR=${atrStartR.toFixed(2)}`
            : (atrMult <= 0 ? `atrMult=${atrMult} ≤ 0` : 'no trail condition');
          console.log(`[TradingAdmin] ATR gating on ${pos.symbol}: ${reason} (no ATR move)`);
        }

        // VWAP guard removed to adhere to fixed strategy (no blending)
      }
    } catch (err) {
      console.warn('[TradingAdmin] Trailing adjustments failed:', err);
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
    } else {
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
};

export const closePosition = async (position: Position, exitPrice: number, reason: string) => {
  const now = new Date().toISOString();

  // Attempt real close at broker if this position was opened on OANDA
  if (position.signal_id?.startsWith('oanda-')) {
    const tradeID = position.signal_id.replace('oanda-', '');
    if (tradeID) {
      try {
        await closeTrade(tradeID);
      } catch (err) {
        console.warn('[TradingAdmin] OANDA close error; continuing with simulated exit:', err);
      }
    }
  }

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

  await db.updatePosition(updatedPosition);

  await db.addLedgerEntry({
    ts: now,
    delta_gbp: pnl_gbp,
    ref_type: LedgerRefType.EXIT,
    ref_id: position.id,
  });

  if (pnl_gbp < 0) {
    const expl = await db.getExplanationByPositionId(position.id);
    if (expl) {
      const failureAnalysis = await generateFailureAnalysis(position, expl);
      await db.updateExplanation({ ...expl, exit_reason: failureAnalysis });
    }
  }

  await sendPushNotificationToAll(
    `Trade Closed`,
    `Closed position on ${position.symbol} with PNL £${pnl_gbp.toFixed(2)} (${reason})`,
    { positionId: position.id }
  );
};