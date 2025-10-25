import { OhlcData } from '../types'; // Adjust if types are defined elsewhere

// Assuming OhlcData is { time: number, open: number, high: number, low: number, close: number, volume: number }

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(data: OhlcData[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
    sma.push(sum / period);
  }
  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(data: OhlcData[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  let previousEma = data.slice(0, period).reduce((acc, candle) => acc + candle.close, 0) / period;
  ema.push(...Array(period - 1).fill(NaN), previousEma);

  for (let i = period; i < data.length; i++) {
    previousEma = (data[i].close - previousEma) * multiplier + previousEma;
    ema.push(previousEma);
  }
  return ema;
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(data: OhlcData[], period: number): number[] {
  const atr: number[] = [];
  const tr: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      tr.push(data[i].high - data[i].low);
    } else {
      const tr1 = data[i].high - data[i].low;
      const tr2 = Math.abs(data[i].high - data[i-1].close);
      const tr3 = Math.abs(data[i].low - data[i-1].close);
      tr.push(Math.max(tr1, tr2, tr3));
    }
  }

  let sum = tr.slice(0, period).reduce((acc, val) => acc + val, 0);
  atr.push(...Array(period - 1).fill(NaN), sum / period);

  for (let i = period; i < data.length; i++) {
    const currentAtr = (atr[i-1] * (period - 1) + tr[i]) / period;
    atr.push(currentAtr);
  }
  return atr;
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(data: OhlcData[]): number[] {
  const vwap: number[] = [];
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;
  let cumulativeTypical = 0;

  for (let i = 0; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
    const vol = data[i].volume && data[i].volume > 0 ? data[i].volume : 0;
    cumulativeTypical += typicalPrice;
    cumulativePriceVolume += typicalPrice * vol;
    cumulativeVolume += vol;

    if (cumulativeVolume > 0) {
      vwap.push(cumulativePriceVolume / cumulativeVolume);
    } else {
      // Fallback for zero-volume FX: equal-weighted typical price average
      vwap.push(cumulativeTypical / (i + 1));
    }
  }
  return vwap;
}

/**
 * Calculate Average Directional Index (ADX) using Wilder's smoothing
 */
export function calculateADX(data: OhlcData[], period: number = 14): number[] {
  const len = data.length;
  const adx: number[] = [];
  if (len === 0) return adx;

  const plusDM: number[] = Array(len).fill(0);
  const minusDM: number[] = Array(len).fill(0);
  const tr: number[] = Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = data[i].high - data[i-1].high;
    const downMove = data[i-1].low - data[i].low;
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const tr1 = data[i].high - data[i].low;
    const tr2 = Math.abs(data[i].high - data[i-1].close);
    const tr3 = Math.abs(data[i].low - data[i-1].close);
    tr[i] = Math.max(tr1, tr2, tr3);
  }

  const smPlusDM: number[] = Array(len).fill(NaN);
  const smMinusDM: number[] = Array(len).fill(NaN);
  const smTR: number[] = Array(len).fill(NaN);

  // Wilder's smoothing
  let sumPlusDM = 0, sumMinusDM = 0, sumTR = 0;
  for (let i = 1; i <= period; i++) {
    sumPlusDM += plusDM[i];
    sumMinusDM += minusDM[i];
    sumTR += tr[i];
  }
  smPlusDM[period] = sumPlusDM;
  smMinusDM[period] = sumMinusDM;
  smTR[period] = sumTR;

  for (let i = period + 1; i < len; i++) {
    smPlusDM[i] = smPlusDM[i-1] - (smPlusDM[i-1] / period) + plusDM[i];
    smMinusDM[i] = smMinusDM[i-1] - (smMinusDM[i-1] / period) + minusDM[i];
    smTR[i] = smTR[i-1] - (smTR[i-1] / period) + tr[i];
  }

  const plusDI: number[] = Array(len).fill(NaN);
  const minusDI: number[] = Array(len).fill(NaN);
  const dx: number[] = Array(len).fill(NaN);

  for (let i = period; i < len; i++) {
    if (smTR[i] === 0) { plusDI[i] = 0; minusDI[i] = 0; dx[i] = 0; continue; }
    plusDI[i] = 100 * (smPlusDM[i] / smTR[i]);
    minusDI[i] = 100 * (smMinusDM[i] / smTR[i]);
    const denom = plusDI[i] + minusDI[i];
    dx[i] = denom === 0 ? 0 : 100 * (Math.abs(plusDI[i] - minusDI[i]) / denom);
  }

  // ADX: smoothed DX
  let adxInit = 0;
  for (let i = period; i < period * 2 && i < len; i++) adxInit += dx[i];
  adx[period * 2 - 1] = adxInit / period;
  for (let i = period * 2; i < len; i++) {
    adx[i] = ((adx[i-1] * (period - 1)) + dx[i]) / period;
  }

  // Fill leading NaNs for alignment
  for (let i = 0; i < period * 2 - 1; i++) adx[i] = NaN;
  return adx;
}

/**
 * Calculate RSI
 */
export function calculateRSI(closes: number[], period: number = 14): number[] {
  if (closes.length < period + 1) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  const rsi: number[] = [];
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const value = 100 - 100 / (1 + rs);
    rsi.push(value);
  }
  return rsi;
}