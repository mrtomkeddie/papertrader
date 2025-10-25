import { OhlcData, StrategySignal, Side } from '../types';
import { calculateVWAP, calculateEMA, calculateATR, calculateRSI } from './indicators';

// VWAP Reversion Strategy
// Enforce 1% deviation from VWAP and RSI gating
// Stop: ATR-based; Target: VWAP

export function evaluateVWAPReversion(ohlc: OhlcData[], emaPeriod: number = 50, atrPeriod: number = 14): StrategySignal | null {
  if (ohlc.length < Math.max(emaPeriod, atrPeriod) + 1) return null;

  const latest = ohlc[ohlc.length - 1];
  const emaSeries = calculateEMA(ohlc, emaPeriod);
  const latestEMA = emaSeries[emaSeries.length - 1];
  const vwapSeries = calculateVWAP(ohlc.slice(-50));
  const latestVWAP = vwapSeries[vwapSeries.length - 1];
  const atrSeries = calculateATR(ohlc, atrPeriod);
  const latestATR = atrSeries[atrSeries.length - 1];
  const closes = ohlc.map(c => c.close);
  const rsiSeries = calculateRSI(closes, 14);
  const latestRSI = rsiSeries[rsiSeries.length - 1];

  if (!Number.isFinite(latestVWAP) || !Number.isFinite(latestATR) || !Number.isFinite(latestEMA) || !Number.isFinite(latestRSI)) return null;

  const deviationPct = (latest.close - latestVWAP) / latestVWAP;

  // Long: price below VWAP by >=1% and RSI < 35, with price above EMA
  if (deviationPct <= -0.01 && latestRSI < 35 && latest.close >= latestEMA) {
    const entry = latest.close;
    const stop = entry - latestATR;
    const tp = latestVWAP;
    const score = Math.abs(deviationPct) * 100;
    return { side: Side.LONG, entry, stop, tp, score, reason: 'VWAP reversion long: >1% below VWAP with RSI<35' } as any;
  }

  // Short: price above VWAP by >=1% and RSI > 65, with price below EMA
  if (deviationPct >= 0.01 && latestRSI > 65 && latest.close <= latestEMA) {
    const entry = latest.close;
    const stop = entry + latestATR;
    const tp = latestVWAP;
    const score = Math.abs(deviationPct) * 100;
    return { side: Side.SHORT, entry, stop, tp, score, reason: 'VWAP reversion short: >1% above VWAP with RSI>65' } as any;
  }

  return null;
}