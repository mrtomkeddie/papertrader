import { OhlcData, StrategySignal } from '../types';
import { calculateVWAP, calculateEMA, calculateATR } from './indicators';

// VWAP Reversion Strategy
// Buy if price is below VWAP in uptrend (above EMA), sell if above VWAP in downtrend
// Stop: recent swing low/high or ATR-based
// TP: 2R or back to VWAP

export function evaluateVWAPReversion(ohlc: OhlcData[], emaPeriod: number = 50, atrPeriod: number = 14): StrategySignal | null {
  if (ohlc.length < emaPeriod + 1) return null;

  const latest = ohlc[ohlc.length - 1];
  const ema = calculateEMA(ohlc, emaPeriod);
  const latestEMA = ema[ema.length - 1];
  const vwap = calculateVWAP(ohlc.slice(-50)); // Last 50 candles for VWAP
  const latestVWAP = vwap[vwap.length - 1];
  const atr = calculateATR(ohlc, atrPeriod);
  const latestATR = atr[atr.length - 1];

  const deviation = (latest.close - latestVWAP) / latestATR;

  if (latest.close < latestVWAP && latest.close > latestEMA && Math.abs(deviation) > 1) {
    // Buy reversion in uptrend
    const entry = latest.close;
    const stop = entry - latestATR;
    const risk = entry - stop;
    const tp = entry + 2 * risk;
    const score = Math.abs(deviation) * (latest.volume / (ohlc.slice(-10).reduce((acc, c) => acc + c.volume, 0) / 10));
    return { signal: 'LONG', entry, stop, tp, score };
  } else if (latest.close > latestVWAP && latest.close < latestEMA && Math.abs(deviation) > 1) {
    // Sell reversion in downtrend
    const entry = latest.close;
    const stop = entry + latestATR;
    const risk = stop - entry;
    const tp = entry - 2 * risk;
    const score = Math.abs(deviation) * (latest.volume / (ohlc.slice(-10).reduce((acc, c) => acc + c.volume, 0) / 10));
    return { signal: 'SHORT', entry, stop, tp, score };
  }

  return null;
}