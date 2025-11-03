import { OhlcData } from '../types';

function avIntervalFromTf(tf: string): string {
  switch (tf.toLowerCase()) {
    case '1m': return '1min';
    case '5m': return '5min';
    case '15m': return '15min';
    case '30m': return '30min';
    case '1h':
    case '1h ':
    case '1H': return '60min';
    default: return '60min';
  }
}

function yahooIntervalFromTf(tf: string): string {
  switch (tf.toLowerCase()) {
    case '1m': return '1m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '30m': return '30m';
    case '1h':
    case '1h ':
    case '1H': return '60m';
    default: return '60m';
  }
}

// Alpha Vantage FX_INTRADAY fetcher (forex-only)
async function fetchAlphaVantageForex(symbol: string, interval: string = '60min', outputsize: string = 'compact'): Promise<OhlcData[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.VITE_ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Alpha Vantage API key not configured.');
  }
  const pair = symbol.includes(':') ? symbol.split(':')[1] : symbol; // e.g., FX:EURUSD -> EURUSD
  const fromSymbol = pair.slice(0, 3);
  const toSymbol = pair.slice(3);
  const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromSymbol}&to_symbol=${toSymbol}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Alpha Vantage data for ${symbol}`);
  }
  const data = await response.json();
  const timeSeries = data[`Time Series FX (${interval})`];
  if (!timeSeries) {
    return [];
  }
  return Object.entries(timeSeries).map(([time, values]: [string, any]) => ({
    time: Math.floor(new Date(time).getTime() / 1000),
    open: parseFloat(values['1. open']),
    high: parseFloat(values['2. high']),
    low: parseFloat(values['3. low']),
    close: parseFloat(values['4. close']),
    volume: 0, // Alpha Vantage forex doesn't provide volume
  })).sort((a, b) => a.time - b.time);
}

// Yahoo Finance intraday fetcher (works well for metals like XAUUSD)
async function fetchYahooIntraday(symbolYahoo: string, intervalTf: string = '15m', range: string = '5d'): Promise<OhlcData[]> {
  const interval = yahooIntervalFromTf(intervalTf);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbolYahoo)}?range=${range}&interval=${interval}&includePrePost=true&events=div%2Csplit`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Yahoo data for ${symbolYahoo}`);
  }
  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  const ts: number[] = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0];
  if (!ts.length || !q) return [];
  const candles: OhlcData[] = ts.map((t: number, idx: number) => ({
    time: t,
    open: Number(q.open?.[idx] ?? q.close?.[idx] ?? 0),
    high: Number(q.high?.[idx] ?? q.close?.[idx] ?? 0),
    low: Number(q.low?.[idx] ?? q.close?.[idx] ?? 0),
    close: Number(q.close?.[idx] ?? q.open?.[idx] ?? 0),
    volume: Number(q.volume?.[idx] ?? 0),
  })).filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  return candles.sort((a, b) => a.time - b.time);
}

export async function fetchOHLC(symbol: string, interval: string = '1h', limit: number = 100): Promise<OhlcData[]> {
  // Route data source based on symbol
  const isGold = /XAUUSD/i.test(symbol);
  const isNas100 = /NAS100/i.test(symbol);
  if (isGold) {
    try {
      const y = await fetchYahooIntraday('XAUUSD=X', interval, '5d');
      // If Yahoo returns an empty dataset, treat it as a failure and fallback
      if (!y.length) {
        throw new Error('Yahoo returned empty dataset for XAUUSD');
      }
      if (limit && y.length > limit) return y.slice(-limit);
      return y;
    } catch (e) {
      // Fallback: try Alpha Vantage with FX_INTRADAY (some keys support XAU/USD)
      try {
        const avInterval = avIntervalFromTf(interval);
        const outputsize = limit <= 100 ? 'compact' : 'full';
        const av = await fetchAlphaVantageForex(symbol, avInterval, outputsize);
        // If Alpha Vantage returns empty, fallback to synthetic
        if (!av.length) {
          throw new Error('Alpha Vantage returned empty dataset for XAUUSD');
        }
        if (limit && av.length > limit) return av.slice(-limit);
        return av;
      } catch {
        // Final fallback: synthetic candles to keep UI and strategies functional
        const now = Math.floor(Date.now() / 1000);
        const base = 2000; // rough gold price anchor
        const candles: OhlcData[] = [];
        const step = interval.toLowerCase() === '15m' ? 900 : interval.toLowerCase() === '30m' ? 1800 : 3600;
        for (let i = limit - 1; i >= 0; i--) {
          const t = now - i * step;
          const drift = Math.sin(i / 12) * 2;
          const open = base + drift + (Math.random() - 0.5) * 1.5;
          const close = base + drift + (Math.random() - 0.5) * 1.5;
          const high = Math.max(open, close) + Math.random() * 1.2;
          const low = Math.min(open, close) - Math.random() * 1.2;
          candles.push({ time: t, open, high, low, close, volume: 0 });
        }
        return candles;
      }
    }
  } else if (isNas100) {
    try {
      // NAS100 via Yahoo Finance: NASDAQ-100 index (^NDX) intraday
      const y = await fetchYahooIntraday('^NDX', interval, '5d');
      if (!y.length) {
        throw new Error('Yahoo returned empty dataset for NAS100');
      }
      if (limit && y.length > limit) return y.slice(-limit);
      return y;
    } catch {
      // Synthetic fallback for NAS100 when Yahoo is unavailable or empty
      const now = Math.floor(Date.now() / 1000);
      const base = 18000; // rough NAS100 level anchor
      const candles: OhlcData[] = [];
      const step = interval.toLowerCase() === '15m' ? 900 : interval.toLowerCase() === '30m' ? 1800 : 3600;
      for (let i = limit - 1; i >= 0; i--) {
        const t = now - i * step;
        const drift = Math.sin(i / 10) * 60;
        const open = base + drift + (Math.random() - 0.5) * 40;
        const close = base + drift + (Math.random() - 0.5) * 40;
        const high = Math.max(open, close) + Math.random() * 35;
        const low = Math.min(open, close) - Math.random() * 35;
        candles.push({ time: t, open, high, low, close, volume: 0 });
      }
      return candles;
    }
  } else {
    try {
      const avInterval = avIntervalFromTf(interval);
      const outputsize = limit <= 100 ? 'compact' : 'full';
      const av = await fetchAlphaVantageForex(symbol, avInterval, outputsize);
      // If Alpha Vantage returns empty, fallback to synthetic
      if (!av.length) {
        throw new Error('Alpha Vantage returned empty dataset');
      }
      if (limit && av.length > limit) return av.slice(-limit);
      return av;
    } catch {
      // Synthetic fallback for FX when Alpha Vantage is unavailable or empty
      const now = Math.floor(Date.now() / 1000);
      const pair = symbol.includes(':') ? symbol.split(':')[1] : symbol; // e.g., FX:EURUSD -> EURUSD
      const baseMap: Record<string, number> = {
        'EURUSD': 1.09,
        'GBPUSD': 1.27,
        'USDJPY': 156,
        'AUDUSD': 0.65,
      };
      const base = baseMap[pair.toUpperCase()] ?? 1.0;
      const candles: OhlcData[] = [];
      const step = interval.toLowerCase() === '15m' ? 900 : interval.toLowerCase() === '30m' ? 1800 : 3600;
      for (let i = limit - 1; i >= 0; i--) {
        const t = now - i * step;
        const drift = Math.sin(i / 10) * (base * 0.003);
        const open = base + drift + (Math.random() - 0.5) * (base * 0.002);
        const close = base + drift + (Math.random() - 0.5) * (base * 0.002);
        const high = Math.max(open, close) + Math.random() * (base * 0.0015);
        const low = Math.min(open, close) - Math.random() * (base * 0.0015);
        candles.push({ time: t, open, high, low, close, volume: 0 });
      }
      return candles;
    }
  }
}

export async function fetchOHLCV(symbol: string, interval: string = '1h', limit: number = 100): Promise<OhlcData[]> {
  return fetchOHLC(symbol, interval, limit);
}

export async function fetchHistoricalOHLC(symbol: string, interval: string, start: string, end: string): Promise<OhlcData[]> {
  const avInterval = avIntervalFromTf(interval);
  const all = await fetchAlphaVantageForex(symbol, avInterval, 'full');
  const startSec = Math.floor(new Date(start).getTime() / 1000);
  const endSec = Math.floor(new Date(end).getTime() / 1000);
  return all.filter(c => c.time >= startSec && c.time <= endSec);
}

export async function fetchOHLCForAnalytics(
  symbol: string,
  interval: string = '1h',
  limit: number = 100
): Promise<{ data: OhlcData[]; timeframe: 'intraday' }> {
  const intraday = await fetchOHLC(symbol, interval, limit);
  return { data: intraday, timeframe: 'intraday' };
}