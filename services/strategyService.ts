import { fetchOHLCV } from './dataService';
import { evaluateORB } from '../strategies/orb';
import { evaluateVWAPReversion } from '../strategies/vwapReversion';
import { evaluateTrendPullback } from '../strategies/trendPullback';
import { Side } from '../types'; // Assuming types are defined here

export interface StrategySignal {
  strategy: string;
  side: Side;
  entry: number;
  stop: number;
  tp: number;
  score: number;
  reason: string; // Basic reason from strategy
  rrr: number;
}

export async function getStrategySignals(symbol: string, timeframe: string): Promise<StrategySignal[]> {
  try {
    const ohlcv = await fetchOHLCV(symbol, timeframe, 100); // Fetch last 100 bars, adjust as needed

    // Run all strategies
    const potentialSignals: (StrategySignal | null)[] = [
      evaluateORB(ohlcv),
      evaluateVWAPReversion(ohlcv),
      evaluateTrendPullback(ohlcv)
    ];

    // Filter non-null and add strategy name, calculate RRR
    const signals: StrategySignal[] = potentialSignals
      .filter((s): s is Exclude<StrategySignal, null> => s !== null) // Type guard
      .map(s => {
        const risk = Math.abs(s.entry - s.stop);
        const reward = s.side === Side.LONG ? s.tp - s.entry : s.entry - s.tp;
        const rrr = reward / risk;
        return { ...s, rrr };
      })
      .filter(s => s.rrr >= 1.5);

    // Assign strategy names (assuming order matches)
    if (signals[0]) signals[0].strategy = 'ORB';
    if (signals[1]) signals[1].strategy = 'VWAP Reversion';
    if (signals[2]) signals[2].strategy = 'Trend Pullback';

    return signals;
  } catch (error) {
    console.error(`Error evaluating strategies for ${symbol}:`, error);
    return [];
  }
}