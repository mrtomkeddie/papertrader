import { OhlcData, StrategySignal } from '../types';
import { calculateEMA, calculateATR } from './indicators';

// Trend Pullback Strategy
// Buy pullback to EMA in uptrend (price > EMA50 > EMA200), sell to EMA in downtrend
// Confirmation: volume increase or candle pattern
// Stop: below EMA or ATR-based
// TP: 2R

export function evaluateTrendPullback(ohlc: OhlcData[], fastEmaPeriod: number = 50, slowEmaPeriod: number = 200, atrPeriod: number = 14): StrategySignal | null {
  if (ohlc.length < slowEmaPeriod + 1) return null;

  const latest = ohlc[ohlc.length - 1];
  const fastEma = calculateEMA(ohlc, fastEmaPeriod);
  const slowEma = calculateEMA(ohlc, slowEmaPeriod);
  const latestFastEMA = fastEma[fastEma.length - 1];
  const latestSlowEMA = slowEma[slowEma.length - 1];
  const atr = calculateATR(ohlc, atrPeriod);
  const latestATR = atr[atr.length - 1];

  const isUptrend = latestFastEMA > latestSlowEMA;
  const isDowntrend = latestFastEMA < latestSlowEMA;

  const pullbackToEMA = Math.abs(latest.close - latestFastEMA) < latestATR * 0.5;

  if (isUptrend && pullbackToEMA && latest.close > latestFastEMA) {
    // Buy pullback
    const entry = latest.close;
    const stop = latestFastEMA - latestATR;
    const risk = entry - stop;
    const tp = entry + 2 * risk;
    const score = (latestFastEMA - latestSlowEMA) / latestATR; // Trend strength
    return { signal: 'LONG', entry, stop, tp, score };
  } else if (isDowntrend && pullbackToEMA && latest.close < latestFastEMA) {
    // Sell pullback
    const entry = latest.close;
    const stop = latestFastEMA + latestATR;
    const risk = stop - entry;
    const tp = entry - 2 * risk;
    const score = (latestSlowEMA - latestFastEMA) / latestATR;
    return { signal: 'SHORT', entry, stop, tp, score };
  }

  return null;
}