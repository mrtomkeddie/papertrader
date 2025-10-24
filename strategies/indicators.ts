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

  for (let i = 0; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
    cumulativePriceVolume += typicalPrice * data[i].volume;
    cumulativeVolume += data[i].volume;
    vwap.push(cumulativePriceVolume / cumulativeVolume);
  }
  return vwap;
}