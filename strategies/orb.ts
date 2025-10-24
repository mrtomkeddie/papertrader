import { OhlcData, StrategySignal } from '../types'; // Adjust if needed
import { calculateATR } from './indicators';

// Opening Range Breakout (ORB) Strategy
// Assumes first N candles define the opening range (e.g., first 15 min)
// Signal LONG if breakout above range high, SHORT below low
// Stop: range low for LONG, high for SHORT
// TP: 2R based on range size or ATR

export function evaluateORB(ohlc: OhlcData[], rangePeriod: number = 5, atrPeriod: number = 14): StrategySignal | null {
  if (ohlc.length < rangePeriod + 1) return null;

  const rangeCandles = ohlc.slice(0, rangePeriod);
  const rangeHigh = Math.max(...rangeCandles.map(c => c.high));
  const rangeLow = Math.min(...rangeCandles.map(c => c.low));
  const rangeSize = rangeHigh - rangeLow;

  const latest = ohlc[ohlc.length - 1];

  const atr = calculateATR(ohlc, atrPeriod);
  const latestATR = atr[atr.length - 1];

  if (latest.close > rangeHigh) {
    // LONG breakout
    const entry = latest.close;
    const stop = rangeLow;
    const risk = entry - stop;
    const tp = entry + 2 * risk; // 2R
    const score = (risk / latestATR) * (latest.volume / (ohlc.slice(-10).reduce((acc, c) => acc + c.volume, 0) / 10)); // Normalize by ATR and volume spike
    return { signal: 'LONG', entry, stop, tp, score };
  } else if (latest.close < rangeLow) {
    // SHORT breakout
    const entry = latest.close;
    const stop = rangeHigh;
    const risk = stop - entry;
    const tp = entry - 2 * risk; // 2R
    const score = (risk / latestATR) * (latest.volume / (ohlc.slice(-10).reduce((acc, c) => acc + c.volume, 0) / 10));
    return { signal: 'SHORT', entry, stop, tp, score };
  }

  return null;
}