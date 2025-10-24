import { OhlcData } from '../types';

// Utility to detect if symbol is crypto (ends with USDT) or forex (e.g., EURUSD)
function isCrypto(symbol: string): boolean {
  return symbol.endsWith('USDT') || symbol.endsWith('BTC'); // Simple heuristic, adjust as needed
}

// Fetch OHLC from Binance for crypto
async function fetchBinanceKlines(symbol: string, interval: string = '1h', limit: number = 100): Promise<OhlcData[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Binance data for ${symbol}`);
  }
  const data = await response.json();
  return data.map(([time, open, high, low, close, volume]: [number, string, string, string, string, string]) => ({
    time: time / 1000, // Convert ms to seconds if needed
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume: parseFloat(volume),
  }));
}

// Fetch OHLC from Alpha Vantage for forex
// Requires ALPHA_VANTAGE_API_KEY in .env
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
    // Graceful no-data handling; let caller decide to fallback
    return [];
  }
  return Object.entries(timeSeries).map(([time, values]: [string, any]) => ({
    time: Math.floor(new Date(time).getTime() / 1000),
    open: parseFloat(values['1. open']),
    high: parseFloat(values['2. high']),
    low: parseFloat(values['3. low']),
    close: parseFloat(values['4. close']),
    volume: 0, // Alpha Vantage forex doesn't provide volume
  })).sort((a, b) => a.time - b.time); // Ensure chronological order
}

// Main fetch function
export async function fetchOHLC(symbol: string, interval: string = '1h', limit: number = 100): Promise<OhlcData[]> {
  if (isCrypto(symbol)) {
    return fetchBinanceKlines(symbol, interval, limit);
  } else {
    const avInterval = interval === '1h' ? '60min' : interval;
    try {
      const av = await fetchAlphaVantageForex(symbol, avInterval, limit <= 100 ? 'compact' : 'full');
      if (av.length > 0) return av;
      // If AV returns empty, fallback to Yahoo
      const pair = symbol.includes(':') ? symbol.split(':')[1] : symbol; // e.g., FX:EURUSD -> EURUSD
      const end = new Date();
      const start = new Date(end.getTime() - limit * 60 * 60 * 1000);
      return await fetchYahooFinanceHistorical(`${pair}=X`, start.toISOString(), end.toISOString(), interval);
    } catch (err) {
      const pair = symbol.includes(':') ? symbol.split(':')[1] : symbol; // e.g., FX:EURUSD -> EURUSD
      const end = new Date();
      const start = new Date(end.getTime() - limit * 60 * 60 * 1000);
      return await fetchYahooFinanceHistorical(`${pair}=X`, start.toISOString(), end.toISOString(), interval);
    }
  }
}
export async function fetchOHLCV(symbol: string, interval: string = '1h', limit: number = 100): Promise<OhlcData[]> {
  return fetchOHLC(symbol, interval, limit);
}
// Fetch historical OHLC from Binance for crypto with date range
async function fetchBinanceKlinesRange(symbol: string, interval: string = '1h', start: number, end: number): Promise<OhlcData[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${end}&limit=1000`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Binance data for ${symbol}`);
  }
  const data = await response.json();
  return data.map(([time, open, high, low, close, volume]: [number, string, string, string, string, string]) => ({
    time: time / 1000,
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume: parseFloat(volume),
  }));
}

// Fetch historical OHLC from Yahoo Finance Chart API for forex
async function fetchYahooFinanceHistorical(symbol: string, startISO: string, endISO: string, interval: string = '1h'): Promise<OhlcData[]> {
  const period1 = Math.floor(new Date(startISO).getTime() / 1000);
  const period2 = Math.floor(new Date(endISO).getTime() / 1000);
  const yahooInterval = interval === '1h' ? '60m' : interval;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${yahooInterval}`;
  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const open = quote.open ?? [];
  const high = quote.high ?? [];
  const low = quote.low ?? [];
  const close = quote.close ?? [];
  const volume = quote.volume ?? [];
  return timestamps.map((t, i) => ({
    time: t,
    open: open[i] ?? close[i] ?? 0,
    high: high[i] ?? close[i] ?? 0,
    low: low[i] ?? close[i] ?? 0,
    close: close[i] ?? 0,
    volume: volume[i] ?? 0,
  })).filter(c => Number.isFinite(c.close));
}

// Updated historical fetch
export async function fetchHistoricalOHLC(symbol: string, interval: string, start: string, end: string): Promise<OhlcData[]> {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (isCrypto(symbol)) {
    return fetchBinanceKlinesRange(symbol, interval, startMs, endMs);
  } else {
    return fetchYahooFinanceHistorical(symbol + '=X', start, end, interval); // Append '=X' for forex pairs
  }
}

const allowDailyFallback =
  (process.env.ALLOW_FOREX_DAILY_FALLBACK || 'false').toLowerCase() === 'true';

// Fetch OHLC from Alpha Vantage FX_DAILY (analytics-only)
async function fetchAlphaVantageForexDaily(symbol: string, outputsize: string = 'compact'): Promise<OhlcData[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.VITE_ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return [];

  const pair = symbol.includes(':') ? symbol.split(':')[1] : symbol; // e.g., FX:EURUSD -> EURUSD
  const fromSymbol = pair.slice(0, 3);
  const toSymbol = pair.slice(3);
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromSymbol}&to_symbol=${toSymbol}&outputsize=${outputsize}&apikey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = await response.json();
  const timeSeries = data['Time Series FX (Daily)'];
  if (!timeSeries) return [];

  return Object.entries(timeSeries)
    .map(([time, values]: [string, any]) => ({
      time: Math.floor(new Date(time).getTime() / 1000),
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: 0,
    }))
    .sort((a, b) => a.time - b.time);
}

// Analytics-only: intraday first, then optional daily fallback (with label)
export async function fetchOHLCForAnalytics(
  symbol: string,
  interval: string = '1h',
  limit: number = 100
): Promise<{ data: OhlcData[]; timeframe: 'intraday' | 'daily' }> {
  const intraday = await fetchOHLC(symbol, interval, limit); // intraday via AV/Yahoo Chart
  if (intraday.length > 0) {
    return { data: intraday, timeframe: 'intraday' };
  }

  if (allowDailyFallback) {
    const daily = await fetchAlphaVantageForexDaily(symbol, limit <= 200 ? 'compact' : 'full');
    if (daily.length > 0) {
      return { data: daily, timeframe: 'daily' };
    }
  }

  return { data: [], timeframe: 'intraday' };
}