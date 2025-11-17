import { Side, StrategySignal } from '../types';
import { evaluateFixedStrategy } from '../strategies/fixedOrbFvgLvn';
import { evaluateLondonLiquiditySweep } from '../strategies/londonLiquiditySweepXau';

// StrategySignal type is now imported from types.ts

export async function getStrategySignals(symbol: string, timeframe: string): Promise<StrategySignal[]> {
  try {
    const out: StrategySignal[] = [];
    const sFixed = await evaluateFixedStrategy(symbol);
    if (sFixed) {
      const risk = Math.abs(sFixed.entry - sFixed.stop);
      const reward = sFixed.side === Side.LONG ? sFixed.tp - sFixed.entry : sFixed.entry - sFixed.tp;
      const rrr = risk > 0 ? (reward / risk) : 0;
      out.push({ ...sFixed, rrr, strategy: 'FIXED ORB + FVG + LVN' });
    }
    if (/XAUUSD/i.test(symbol)) {
      const sLondon = await evaluateLondonLiquiditySweep('OANDA:XAUUSD');
      if (sLondon) {
        const risk2 = Math.abs(sLondon.entry - sLondon.stop);
        const reward2 = sLondon.side === Side.LONG ? sLondon.tp - sLondon.entry : sLondon.entry - sLondon.tp;
        const rrr2 = risk2 > 0 ? (reward2 / risk2) : 0;
        out.push({ ...sLondon, rrr: rrr2, strategy: 'London Liquidity Sweep (Gold)' });
      }
    }
    return out;
  } catch (error) {
    console.error(`Error evaluating strategies for ${symbol}:`, error);
    return [];
  }
}