import * as db from './adminDatabase';
import { AiTradeAction, Side, Position, PositionStatus, LedgerRefType, Explanation } from '../types';
import { generateExplanationText } from '../services/geminiService';

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
  } as any);

  const newExplanation: Omit<Explanation, 'id'> = {
    position_id: addedPosition.id,
    plain_english_entry: `AI Trade (${trade.strategy_type}): ${trade.reason}\n\n${explanationText}`,
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

  return { success: true, message: `AI Position ${addedPosition.id} opened for ${symbol}` };
};