import { StrategySignal, Side, OhlcData } from '../types';
import { TIMEFRAME_BY_SYMBOL } from '../constants';
import { fetchOHLCV } from '../services/dataService';

// NY cash open in UTC with DST handling
function getNyOpenUtc(date: Date): Date {
  const year = date.getUTCFullYear();
  // DST start: second Sunday in March => NY open 13:30 UTC
  const march = new Date(Date.UTC(year, 2, 1));
  const firstSundayInMarch = 7 - march.getUTCDay();
  const secondSundayInMarch = 1 + firstSundayInMarch + 7; // day number
  const dstStart = new Date(Date.UTC(year, 2, secondSundayInMarch));
  // DST end: first Sunday in November => NY open 14:30 UTC
  const nov = new Date(Date.UTC(year, 10, 1));
  const firstSundayInNov = 7 - nov.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, 1 + firstSundayInNov));

  const isDst = date >= dstStart && date < dstEnd;
  const openHour = isDst ? 13 : 14;
  const openMinute = 30;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), openHour, openMinute, 0, 0));
}

function pctOf(price: number, delta: number): number {
  if (!Number.isFinite(price) || price === 0) return 0;
  return (delta / price) * 100;
}

function withinWindow(now: Date): { open: Date; orEnd: Date; windowEnd: Date; inside: boolean } {
  const open = getNyOpenUtc(now);
  const orEnd = new Date(open.getTime() + 15 * 60_000);
  const windowEnd = new Date(open.getTime() + 3 * 60 * 60_000);
  const dow = now.getUTCDay();
  const inside = dow >= 1 && dow <= 5 && now >= orEnd && now <= windowEnd;
  return { open, orEnd, windowEnd, inside };
}

function findCandleIndexAtOr(ohlcv: OhlcData[], open: Date): number {
  // candles are 15m; find the candle that begins at open
  const openTs = Math.floor(open.getTime() / 1000);
  return ohlcv.findIndex(c => c.time >= openTs && c.time < openTs + 15 * 60);
}

function detectFvgAfterBreakout(
  ohlcv: OhlcData[],
  startIdx: number,
  side: Side
): { zoneLow: number; zoneHigh: number; fvgIdx: number } | null {
  const maxLookahead = 5; // within 5 candles after breakout
  for (let i = startIdx; i < Math.min(ohlcv.length - 2, startIdx + maxLookahead); i++) {
    const c1 = ohlcv[i];
    const c2 = ohlcv[i + 1];
    const c3 = ohlcv[i + 2];
    if (side === Side.LONG) {
      const cond = Math.min(c2.low, c3.low) > c1.high;
      if (cond) {
        const zoneLow = c1.high;
        const zoneHigh = Math.min(c2.low, c3.low);
        return { zoneLow, zoneHigh, fvgIdx: i + 2 };
      }
    } else {
      const cond = Math.max(c2.high, c3.high) < c1.low;
      if (cond) {
        const zoneLow = Math.max(c2.high, c3.high);
        const zoneHigh = c1.low;
        return { zoneLow, zoneHigh, fvgIdx: i + 2 };
      }
    }
  }
  return null;
}

function computeVolumeProfile(candles: OhlcData[], bins = 60): { levels: number[]; volumes: number[] } {
  const minP = Math.min(...candles.map(c => c.low));
  const maxP = Math.max(...candles.map(c => c.high));
  const range = maxP - minP;
  if (range <= 0) return { levels: [], volumes: [] };
  const step = range / bins;
  const levels = Array.from({ length: bins }, (_, i) => minP + i * step);
  const volumes = new Array(bins).fill(0);
  for (const c of candles) {
    const v = Number(c.volume ?? 0) || 1; // fallback if missing
    const lowIdx = Math.max(0, Math.floor((c.low - minP) / step));
    const highIdx = Math.min(bins - 1, Math.floor((c.high - minP) / step));
    for (let i = lowIdx; i <= highIdx; i++) volumes[i] += v;
  }
  return { levels, volumes };
}

function findLvnNearZone(
  candles: OhlcData[],
  zoneLow: number,
  zoneHigh: number,
  orSize: number
): { lvnPrice: number; lvnZoneLow: number; lvnZoneHigh: number } | null {
  const { levels, volumes } = computeVolumeProfile(candles, 60);
  if (levels.length === 0) return null;
  const maxVol = Math.max(...volumes);
  const threshold = 0.4 * maxVol;
  const candidates: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    if (volumes[i] < threshold) candidates.push(levels[i]);
  }
  if (!candidates.length) return null;
  const zoneMid = (zoneLow + zoneHigh) / 2;
  candidates.sort((a, b) => Math.abs(a - zoneMid) - Math.abs(b - zoneMid));
  const lvnPrice = candidates[0];
  const lvnZoneLow = lvnPrice - 0.1 * orSize;
  const lvnZoneHigh = lvnPrice + 0.1 * orSize;
  // overlap or within 0.25×OR size
  const overlap = Math.min(zoneHigh, lvnZoneHigh) - Math.max(zoneLow, lvnZoneLow);
  const within = Math.abs(zoneMid - lvnPrice) <= 0.25 * orSize;
  if (overlap > 0 || within) return { lvnPrice, lvnZoneLow, lvnZoneHigh };
  return null;
}

export async function evaluateFixedStrategy(symbol: string): Promise<StrategySignal | null> {
  const now = new Date();
  const { open, orEnd, windowEnd, inside } = withinWindow(now);
  if (!inside) return null;

  const tf = TIMEFRAME_BY_SYMBOL[symbol] || '15m';
  const ohlcv = await fetchOHLCV(symbol, tf, 300);
  if (ohlcv.length < 80) return null;

  // Find OR candle and OR bounds
  const orIdx = findCandleIndexAtOr(ohlcv, open);
  if (orIdx < 0) return null;
  const orCandle = ohlcv[orIdx];
  const orHigh = orCandle.high;
  const orLow = orCandle.low;
  const orSize = orHigh - orLow;

  const lastPrice = ohlcv[ohlcv.length - 1].close;
  const orPct = pctOf(lastPrice, orSize);
  const isGold = /XAUUSD/i.test(symbol);
  const isNas = /NAS100/i.test(symbol);
  if (!isGold && !isNas) return null; // trade only XAUUSD, NAS100

  // OR eligibility
  if (isGold) {
    if (orPct < 0.15 || orPct > 1.0) return null;
  } else if (isNas) {
    if (orPct < 0.20 || orPct > 1.2) return null;
  }

  // Search for breakout after OR completes, within 3h window
  const windowEndTs = Math.floor(windowEnd.getTime() / 1000);
  const orEndTs = Math.floor(orEnd.getTime() / 1000);
  let breakoutIdx: number | null = null;
  let breakoutSide: Side | null = null;
  for (let i = orIdx + 1; i < ohlcv.length; i++) {
    const c = ohlcv[i];
    if (c.time > windowEndTs) break;
    if (c.time < orEndTs) continue; // ensure after OR completes
    if (c.close > orHigh) { breakoutIdx = i; breakoutSide = Side.LONG; break; }
    if (c.close < orLow) { breakoutIdx = i; breakoutSide = Side.SHORT; break; }
  }
  if (breakoutIdx == null || breakoutSide == null) return null;

  // Detect FVG within next 5 candles after breakout
  const fvg = detectFvgAfterBreakout(ohlcv, breakoutIdx, breakoutSide);
  if (!fvg) return null;
  // FVG must be above/touch OR High for long; below/touch OR Low for short
  if (breakoutSide === Side.LONG && fvg.zoneLow < orHigh) return null;
  if (breakoutSide === Side.SHORT && fvg.zoneHigh > orLow) return null;

  // LVN alignment from last 60 candles (including OR)
  const last60 = ohlcv.slice(Math.max(0, orIdx - 59), orIdx + 1);
  const lvn = findLvnNearZone(last60, fvg.zoneLow, fvg.zoneHigh, orSize);
  if (!lvn) return null;

  // Retest: within 10 candles after FVG detection
  const zoneLow = Math.max(fvg.zoneLow, lvn.lvnZoneLow);
  const zoneHigh = Math.min(fvg.zoneHigh, lvn.lvnZoneHigh);
  const zoneMid = (zoneLow + zoneHigh) / 2;
  let entryIdx: number | null = null;
  for (let i = fvg.fvgIdx + 1; i <= Math.min(ohlcv.length - 1, fvg.fvgIdx + 10); i++) {
    const c = ohlcv[i];
    const touchesZone = (c.low <= zoneHigh && c.high >= zoneLow);
    const closesBull = c.close > c.open;
    const closesBear = c.close < c.open;
    const closesAboveMid = c.close > zoneMid;
    const closesBelowMid = c.close < zoneMid;
    if (breakoutSide === Side.LONG && touchesZone && closesBull && closesAboveMid) {
      entryIdx = i; break;
    }
    if (breakoutSide === Side.SHORT && touchesZone && closesBear && closesBelowMid) {
      entryIdx = i; break;
    }
  }
  if (entryIdx == null) return null;

  const entryC = ohlcv[entryIdx];
  const entry = entryC.close;
  let stop = 0;
  if (isGold) {
    stop = breakoutSide === Side.LONG ? orLow : orHigh; // fixed
  } else {
    const buffer = 0.15 * orSize;
    stop = breakoutSide === Side.LONG ? (orLow - buffer) : (orHigh + buffer);
  }
  const r = Math.abs(entry - stop);
  const tp = breakoutSide === Side.LONG ? (entry + 3 * r) : (entry - 3 * r); // tp2 default

  const reason = `NY OR (${new Date(orEnd.getTime()).toISOString()}) | OR=${orHigh.toFixed(2)}-${orLow.toFixed(2)} (${orPct.toFixed(2)}%) | Breakout ${breakoutSide} | FVG ${fvg.zoneLow.toFixed(2)}-${fvg.zoneHigh.toFixed(2)} + LVN @${lvn.lvnPrice.toFixed(2)} | Retest + rejection`;
  const score = 1.0;
  const rrr = r > 0 ? (Math.abs(tp - entry) / r) : 0;
  const signal: StrategySignal = {
    side: breakoutSide,
    entry,
    stop,
    tp,
    score,
    reason,
    rrr,
    strategy: 'FIXED ORB + FVG + LVN',
    bar_time: entryC.time * 1000,
  };
  return signal;
}