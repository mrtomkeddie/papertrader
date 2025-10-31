import { OhlcData, StrategySignal, Side } from '../types';
import { calculateEMA, calculateATR, calculateADX } from './indicators';

// Trend Pullback Strategy
// EMA 9/21 alignment with ADX > 25 gating
// Stop: 1.5x ATR; TP: 2x ATR

export function evaluateTrendPullback(ohlc: OhlcData[], fastEmaPeriod: number = 9, slowEmaPeriod: number = 21, atrPeriod: number = 14): StrategySignal | null {
  if (ohlc.length < slowEmaPeriod + 1) return null;

  const latest = ohlc[ohlc.length - 1];
  const fastEma = calculateEMA(ohlc, fastEmaPeriod);
  const slowEma = calculateEMA(ohlc, slowEmaPeriod);
  const atr = calculateATR(ohlc, atrPeriod);
  const adxSeries = calculateADX(ohlc, 14);

  const latestFastEMA = fastEma[fastEma.length - 1];
  const latestSlowEMA = slowEma[slowEma.length - 1];
  const latestATR = atr[atr.length - 1];
  const latestADX = adxSeries[adxSeries.length - 1];

  if (!Number.isFinite(latestADX) || latestADX <= 25) return null;

  const isUptrend = latestFastEMA > latestSlowEMA;
  const isDowntrend = latestFastEMA < latestSlowEMA;

  const nearFastEMA = Math.abs(latest.close - latestFastEMA) <= latestATR * 0.5;

  // Require break of pullback candle for entry
  const prev = ohlc[ohlc.length - 2];

  if (isUptrend && nearFastEMA && latest.close >= latestFastEMA && prev && latest.close > prev.high) {
    const entry = latest.close;
    const stop = entry - 1.8 * latestATR;
    const tp = entry + 2.2 * latestATR;
    const score = (latestFastEMA - latestSlowEMA) / (latestATR || 1);
    return { side: Side.LONG, entry, stop, tp, score, reason: 'Trend pullback long: EMA9>EMA21, ADX>25, break of pullback high', rrr: Math.abs(tp - entry) / Math.abs(entry - stop) } as any;
  }

  if (isDowntrend && nearFastEMA && latest.close <= latestFastEMA && prev && latest.close < prev.low) {
    const entry = latest.close;
    const stop = entry + 1.8 * latestATR;
    const tp = entry - 2.2 * latestATR;
    const score = (latestSlowEMA - latestFastEMA) / (latestATR || 1);
    return { side: Side.SHORT, entry, stop, tp, score, reason: 'Trend pullback short: EMA9<EMA21, ADX>25, break of pullback low', rrr: Math.abs(tp - entry) / Math.abs(entry - stop) } as any;
  }

  return null;
}