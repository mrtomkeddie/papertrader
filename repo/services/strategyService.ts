import { Side, StrategySignal } from '../types';
import { evaluateFixedStrategy } from '../strategies/fixedOrbFvgLvn';

// StrategySignal type is now imported from types.ts

export async function getStrategySignals(symbol: string, timeframe: string): Promise<StrategySignal[]> {
  try {
    const s = await evaluateFixedStrategy(symbol);
    if (!s) return [];
    const risk = Math.abs(s.entry - s.stop);
    const reward = s.side === Side.LONG ? s.tp - s.entry : s.entry - s.tp;
    const rrr = risk > 0 ? (reward / risk) : 0;
    const signal: StrategySignal = { ...s, rrr, strategy: 'FIXED ORB + FVG + LVN' };
    return [signal];
  } catch (error) {
    console.error(`Error evaluating strategies for ${symbol}:`, error);
    return [];
  }
}