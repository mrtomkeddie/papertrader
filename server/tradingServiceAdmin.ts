import * as db from './adminDatabase';
import { AiTradeAction, Side, Position, PositionStatus, LedgerRefType, Explanation } from '../types';
import { generateExplanationText, generateFailureAnalysis } from '../services/geminiService';
import { sendPushNotificationToAll } from './notificationService';

export const executeAiTrade = async (
  trade: NonNullable<AiTradeAction['trade']>,
  symbol: string,
  riskAmountGbp: number
): Promise<{ success: boolean; message: string }> => {
  const now = new Date().toISOString();

  const slippageFactor = (trade.slippage_bps + trade.fee_bps) / 10000;
  const entry_price = trade.side === Side.LONG
    ? trade.entry_price * (1 + slippageFactor)
    : trade.entry_price * (1 - slippageFactor);

  const risk_per_share = Math.abs(entry_price - trade.stop_price);
  if (risk_per_share === 0) {
    return { success: false, message: 'Risk per share is zero, cannot open position.' };
  }

  const qty = riskAmountGbp / risk_per_share;

  const newPosition: Omit<Position, 'id'> = {
    status: PositionStatus.OPEN,
    side: trade.side,
    symbol,
    entry_ts: now,
    entry_price,
    qty,
    stop_price: trade.stop_price,
    tp_price: trade.tp_price,
    exit_ts: null,
    exit_price: null,
    pnl_gbp: null,
    R_multiple: null,
    strategy_id: 'ai-generated',
    signal_id: `ai-${crypto.randomUUID()}`,
    slippage_bps: trade.slippage_bps,
    fee_bps: trade.fee_bps,
    method_name: trade.strategy_type,
  };

  const addedPosition = await db.addPosition(newPosition);

  const explanationText = await generateExplanationText(addedPosition, {
    id: 'ai-generated',
    name: trade.strategy_type,
    symbol,
    timeframe: trade.suggested_timeframe || '1H',
    risk_per_trade_gbp: riskAmountGbp,
    stop_logic: (trade.strategy_type?.toUpperCase().includes('SWING') ? 'SWING' : 'ATR') as any,
    atr_mult: 1.5,
    take_profit_R: Math.max(1.5, trade.risk_reward_ratio || 2),
    slippage_bps: trade.slippage_bps,
    fee_bps: trade.fee_bps,
    enabled: true,
  } as any, trade.reason);

  const newExplanation: Omit<Explanation, 'id'> = {
    position_id: addedPosition.id,
    plain_english_entry: explanationText,
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
    
    const mockPrice = lastPrice * (1 + (Math.random() - 0.5) * 0.05);

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
    } else {
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
};

export const closePosition = async (position: Position, exitPrice: number, reason: string) => {
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