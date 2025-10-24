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
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Alpha Vantage API key not configured.');
  }
  const fromSymbol = symbol.slice(0, 3);
  const toSymbol = symbol.slice(3);
  const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromSymbol}&to_symbol=${toSymbol}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Alpha Vantage data for ${symbol}`);
  }
  const data = await response.json();
  const timeSeries = data[`Time Series FX (${interval})`];
  if (!timeSeries) {
    throw new Error('No data returned from Alpha Vantage.');
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
    // For forex, use 60min if interval is 1h, adjust as needed
    const avInterval = interval === '1h' ? '60min' : interval;
    return fetchAlphaVantageForex(symbol, avInterval, limit <= 100 ? 'compact' : 'full');
  }
}

// Fetch historical OHLC from Binance for crypto with date range
async function fetchBinanceKlines(symbol: string, interval: string = '1h', start: number, end: number): Promise<OhlcData[]> {
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

// Fetch historical OHLC from Yahoo Finance for forex
import yahooFinance from 'yahoo-finance2';

async function fetchYahooFinanceHistorical(symbol: string, start: string, end: string, interval: string = '1h'): Promise<OhlcData[]> {
  const queryOptions = { period1: start, period2: end, interval };
  const result = await yahooFinance.historical(symbol, queryOptions);
  return result.map((bar: any) => ({
    time: Math.floor(new Date(bar.date).getTime() / 1000),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume || 0,
  }));
}

// Updated historical fetch
export async function fetchHistoricalOHLC(symbol: string, interval: string, start: string, end: string): Promise<OhlcData[]> {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (isCrypto(symbol)) {
    return fetchBinanceKlines(symbol, interval, startMs, endMs);
  } else {
    return fetchYahooFinanceHistorical(symbol + '=X', start, end, interval); // Append '=X' for forex pairs
  }
}

// Remove or comment out the old fetchOHLC if not needed, or keep for recent data