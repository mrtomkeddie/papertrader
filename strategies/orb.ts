import { OhlcData, StrategySignal, Side } from '../types'; // Adjust if needed
import { calculateATR } from './indicators';

// Opening Range Breakout (ORB) Strategy
// Use the first 15-minute bar of the current session as opening range
// Conditional volume gating only when non-zero volumes are available

export function evaluateORB(
  ohlc: OhlcData[],
  rangePeriod: number = 1,
  atrPeriod: number = 14
): StrategySignal | null {
  if (ohlc.length < rangePeriod + 1) return null;

  const now = new Date();
  const openingIndex = ohlc.findIndex((c) => {
    const d = new Date(c.time * 1000);
    return (
      d.getUTCFullYear() === now.getUTCFullYear() &&
      d.getUTCMonth() === now.getUTCMonth() &&
      d.getUTCDate() === now.getUTCDate() &&
      d.getUTCHours() === 12 &&
      d.getUTCMinutes() === 0
    );
  });

  if (openingIndex === -1) return null;

  const rangeCandles = ohlc.slice(openingIndex, openingIndex + rangePeriod);
  const rangeHigh = Math.max(...rangeCandles.map((c) => c.high));
  const rangeLow = Math.min(...rangeCandles.map((c) => c.low));

  const latest = ohlc[ohlc.length - 1];
  const atr = calculateATR(ohlc, atrPeriod);
  const lastAtr = atr[atr.length - 1];
  if (!Number.isFinite(lastAtr) || lastAtr <= 0) return null;

  const last10 = ohlc.slice(-10);
  const avgVol = last10.reduce((sum, c) => sum + (c.volume ?? 0), 0) / last10.length;
  const hasVolume = avgVol > 0;
  const volumePass = !hasVolume || latest.volume >= avgVol;

  const breakoutUp = latest.close > rangeHigh && volumePass;
  const breakoutDown = latest.close < rangeLow && volumePass;

  if (!breakoutUp && !breakoutDown) return null;

  const side = breakoutUp ? Side.LONG : Side.SHORT;
  const entry = latest.close;
  const stop = breakoutUp ? rangeLow - lastAtr * 0.2 : rangeHigh + lastAtr * 0.2;
  const tp = breakoutUp ? entry + lastAtr * 2 : entry - lastAtr * 2;

  const score = 0.6 + (volumePass ? 0.2 : 0) + 0.2; // simple heuristic

  return {
    strategy: 'ORB',
    side,
    entry,
    stop,
    tp,
    score,
    reason: `ORB breakout of 12:00–12:15 opening range (rangeHigh=${rangeHigh.toFixed(5)}, rangeLow=${rangeLow.toFixed(5)})`,
    rrr: Math.abs(tp - entry) / Math.abs(entry - stop),
  };
}