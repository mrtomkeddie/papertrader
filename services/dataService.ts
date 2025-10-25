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

export async function fetchOHLC(symbol: string, interval: string = '1h', limit: number = 100): Promise<OhlcData[]> {
  const avInterval = avIntervalFromTf(interval);
  const outputsize = limit <= 100 ? 'compact' : 'full';
  const av = await fetchAlphaVantageForex(symbol, avInterval, outputsize);
  if (limit && av.length > limit) return av.slice(-limit);
  return av;
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