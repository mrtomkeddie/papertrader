import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, CandlestickData, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { Side } from '../types';

interface AnnotatedChartProps {
  symbol: string;
  timeframe?: string; // e.g. '1H', '15M', '1D'
  side: Side;
  entryPrice: number;
  stopPrice: number;
  tpPrice: number;
  entryTs: string; // ISO
  exitTs?: string | null; // ISO
}

// Map our timeframe string to Binance interval strings
const mapTimeframeToBinance = (tf?: string): string => {
  if (!tf) return '1h';
  const unit = tf.slice(-1).toUpperCase();
  const value = tf.slice(0, -1);
  if (unit === 'M') return `${value}m`;
  if (unit === 'H') return `${value}h`;
  if (unit === 'D') return `${value}d`;
  if (unit === 'W') return `${value}w`;
  return '1h';
};

// Attempt to guess a Binance symbol from an app symbol
const guessBinanceSymbol = (s: string): string | null => {
  // If already looks like Binance, keep as-is
  if (/USDT$/.test(s)) return s;
  // Common conversions
  if (/USD$/.test(s)) return s.replace(/USD$/, 'USDT');
  if (/USDC$/.test(s)) return s.replace(/USDC$/, 'USDT');
  // If contains a dash, remove it (BTC-USD -> BTCUSD -> BTCUSDT)
  if (s.includes('-')) {
    const compact = s.replace(/-/g, '');
    if (/USD$/.test(compact)) return compact.replace(/USD$/, 'USDT');
    if (/USDT$/.test(compact)) return compact;
  }
  // Otherwise return null (likely equity/forex)
  return null;
};

const toUtc = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

const buildSyntheticCandles = (entryIso: string, exitIso: string | null | undefined, price: number): CandlestickData[] => {
  const start = toUtc(entryIso) - 3600 * 6; // 6h before
  const end = exitIso ? toUtc(exitIso) + 3600 * 6 : toUtc(entryIso) + 3600 * 12; // 12h after
  const candles: CandlestickData[] = [];
  const step = 900; // 15m
  let p = price;
  for (let t = start; t <= end; t += step) {
    const delta = (Math.sin(t / 1800) + Math.random() - 0.5) * (price * 0.002);
    const open = p;
    const close = Math.max(0.0001, p + delta);
    const high = Math.max(open, close) + Math.abs(delta) * 0.6;
    const low = Math.min(open, close) - Math.abs(delta) * 0.6;
    candles.push({ time: t as UTCTimestamp, open, high, low, close });
    p = close;
  }
  return candles;
};

const fetchBinanceKlines = async (symbol: string, interval: string, startTimeMs: number, endTimeMs: number): Promise<CandlestickData[]> => {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTimeMs}&endTime=${endTimeMs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data: any[] = await res.json();
  return data.map(k => ({
    time: Math.floor(k[0] / 1000) as UTCTimestamp,
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
  }));
};

const AnnotatedChart: React.FC<AnnotatedChartProps> = ({
  symbol,
  timeframe,
  side,
  entryPrice,
  stopPrice,
  tpPrice,
  entryTs,
  exitTs,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#D1D5DB' },
      grid: { vertLines: { color: '#1F2937' }, horzLines: { color: '#1F2937' } },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151' },
      crosshair: { mode: 1 },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });

    const binanceSymbol = guessBinanceSymbol(symbol);
    const interval = mapTimeframeToBinance(timeframe);
    const startMs = new Date(entryTs).getTime() - 1000 * 60 * 60 * 12; // 12h before
    const endMs = exitTs ? new Date(exitTs).getTime() + 1000 * 60 * 60 * 12 : new Date(entryTs).getTime() + 1000 * 60 * 60 * 24; // 24h after

    (async () => {
      try {
        const candles = binanceSymbol
          ? await fetchBinanceKlines(binanceSymbol, interval, startMs, endMs)
          : buildSyntheticCandles(entryTs, exitTs, entryPrice);
        candleSeries.setData(candles);
      } catch (e) {
        const candles = buildSyntheticCandles(entryTs, exitTs, entryPrice);
        candleSeries.setData(candles);
      }

      // Price lines for entry/stop/tp
      candleSeries.createPriceLine({
        price: entryPrice,
        color: side === Side.LONG ? '#22c55e' : '#ef4444',
        lineStyle: LineStyle.Solid,
        lineWidth: 2,
        axisLabelVisible: true,
        title: 'Entry',
      });

      candleSeries.createPriceLine({
        price: stopPrice,
        color: '#ef4444',
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        axisLabelVisible: true,
        title: 'Stop',
      });

      candleSeries.createPriceLine({
        price: tpPrice,
        color: '#22c55e',
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        axisLabelVisible: true,
        title: 'TP',
      });

      // Markers for entry/exit
      const entryTime = toUtc(entryTs);
      const markers: Parameters<ISeriesApi<'Candlestick'>['setMarkers']>[0] = [
        {
          time: entryTime,
          position: side === Side.LONG ? 'belowBar' : 'aboveBar',
          shape: side === Side.LONG ? 'arrowUp' : 'arrowDown',
          color: side === Side.LONG ? '#22c55e' : '#ef4444',
          text: 'Entry',
        },
      ];
      if (exitTs) {
        markers.push({
          time: toUtc(exitTs),
          position: side === Side.LONG ? 'aboveBar' : 'belowBar',
          shape: side === Side.LONG ? 'arrowDown' : 'arrowUp',
          color: '#93c5fd',
          text: 'Exit',
        });
      }
      candleSeries.setMarkers(markers);

      chart.timeScale().fitContent();
    })();

    // Resize handling
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        chart.applyOptions({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [symbol, timeframe, side, entryPrice, stopPrice, tpPrice, entryTs, exitTs]);

  return <div className="w-full h-full" ref={containerRef} />;
};

export default AnnotatedChart;