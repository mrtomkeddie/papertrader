import { fetchOHLCV } from './dataService';
import { evaluateORB } from '../strategies/orb';
import { evaluateVWAPReversion } from '../strategies/vwapReversion';
import { evaluateTrendPullback } from '../strategies/trendPullback';
import { Side } from '../types'; // Assuming types are defined here
import { calculateADX } from '../strategies/indicators';

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
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const dow = now.getUTCDay();
    const inForex = dow >= 1 && dow <= 5;

    const signalsBucket: any[] = [];

    // ORB window: 12:15–14:00 UTC on 15m data
    if (inForex && ((hour === 12 && minute >= 15) || (hour === 13))) {
      const orbOhlcv = await fetchOHLCV(symbol, '15m', 120);
      const s = evaluateORB(orbOhlcv);
      if (s) signalsBucket.push({ ...s, strategy: 'ORB' });
    }

    // VWAP Reversion window: 14–17 UTC on 1h data
    if (inForex && hour >= 14 && hour < 17) {
      const ohlcv1h = await fetchOHLCV(symbol, '1h', 150);
      const s = evaluateVWAPReversion(ohlcv1h);
      if (s) signalsBucket.push({ ...s, strategy: 'VWAP Reversion' });
    }

    // Trend Pullback window: 17–20 UTC on 1h data with ADX > 25 gating
    if (inForex && hour >= 17 && hour < 20) {
      const ohlcv1h = await fetchOHLCV(symbol, '1h', 150);
      const adxSeries = calculateADX(ohlcv1h, 14);
      const latestAdx = adxSeries[adxSeries.length - 1] ?? NaN;
      if (Number.isFinite(latestAdx) && latestAdx > 25) {
        const s = evaluateTrendPullback(ohlcv1h);
        if (s) signalsBucket.push({ ...s, strategy: 'Trend Pullback' });
      }
    }

    const signals: StrategySignal[] = signalsBucket
      .map((s: any) => {
        const risk = Math.abs(s.entry - s.stop);
        const reward = s.side === Side.LONG ? s.tp - s.entry : s.entry - s.tp;
        const rrr = reward / risk;
        return { ...s, rrr };
      })
      .filter((s: any) => s.rrr >= 1.5);

    return signals;
  } catch (error) {
    console.error(`Error evaluating strategies for ${symbol}:`, error);
    return [];
  }
}