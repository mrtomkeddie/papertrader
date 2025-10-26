import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, CandlestickData, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { Position, Side } from '../types';
import { useDatabase } from '../hooks/useDatabase';

interface LightweightTradeChartProps {
  selectedPosition: Position;
}

const toUtc = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

async function fetchEurusd1h(limit: number = 200): Promise<CandlestickData[]> {
  const apiKey = (import.meta.env.VITE_ALPHA_VANTAGE_API_KEY as string | undefined);
  if (!apiKey) {
    // Fallback: synthetic candles centered around current time if API key missing
    const now = Math.floor(Date.now() / 1000);
    const price = 1.10;
    const candles: CandlestickData[] = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = (now - i * 3600) as UTCTimestamp; // 1h steps
      const base = price + Math.sin(i / 10) * 0.0015;
      const open = Math.max(0.0001, base + (Math.random() - 0.5) * 0.0006);
      const close = Math.max(0.0001, base + (Math.random() - 0.5) * 0.0006);
      const high = Math.max(open, close) + Math.random() * 0.0004;
      const low = Math.min(open, close) - Math.random() * 0.0004;
      candles.push({ time: t, open, high, low, close });
    }
    return candles;
  }

  try {
    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=EUR&to_symbol=USD&interval=60min&outputsize=full&apikey=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const series = data['Time Series FX (60min)'];
    if (!series || typeof series !== 'object') {
      throw new Error('Invalid Alpha Vantage response');
    }
    const candles: CandlestickData[] = Object.entries(series)
      .map(([time, values]: [string, any]) => ({
        time: Math.floor(new Date(time).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
      }))
      .sort((a, b) => a.time - b.time);
    return candles.slice(-limit);
  } catch (e) {
    // Fallback to synthetic if rate-limited or failed
    const now = Math.floor(Date.now() / 1000);
    const price = 1.10;
    const candles: CandlestickData[] = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = (now - i * 3600) as UTCTimestamp;
      const base = price + Math.sin(i / 10) * 0.0015;
      const open = Math.max(0.0001, base + (Math.random() - 0.5) * 0.0006);
      const close = Math.max(0.0001, base + (Math.random() - 0.5) * 0.0006);
      const high = Math.max(open, close) + Math.random() * 0.0004;
      const low = Math.min(open, close) - Math.random() * 0.0004;
      candles.push({ time: t, open, high, low, close });
    }
    return candles;
  }
}

const LightweightTradeChart: React.FC<LightweightTradeChartProps> = ({ selectedPosition }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: positions } = useDatabase<Position[]>('positions');

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#D1D5DB' },
      grid: { vertLines: { color: '#1F2937' }, horzLines: { color: '#1F2937' } },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151' },
      crosshair: { mode: 1 },
    });

    const candlesSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });

    let ro: ResizeObserver | null = null;

    (async () => {
      const candles = await fetchEurusd1h(200);
      candlesSeries.setData(candles);

      // Price lines for selected trade stop/tp
      if (selectedPosition) {
        candlesSeries.createPriceLine({
          price: selectedPosition.stop_price,
          color: '#ef4444',
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
          axisLabelVisible: true,
          title: 'Stop',
        });
        candlesSeries.createPriceLine({
          price: selectedPosition.tp_price,
          color: '#22c55e',
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
          axisLabelVisible: true,
          title: 'TP',
        });
      }

      // Build markers from all positions (EURUSD only)
      const markers: Parameters<ISeriesApi<'Candlestick'>['setMarkers']>[0] = [];
      (positions || []).filter(p => p.symbol === 'FX:EURUSD').forEach(p => {
        const isSelected = p.id === selectedPosition.id;
        const entryColor = isSelected ? '#fbbf24' : (p.side === Side.LONG ? '#22c55e' : '#ef4444');
        const exitColor = isSelected ? '#93c5fd' : '#93c5fd';
        const entryPos = p.side === Side.LONG ? 'belowBar' : 'aboveBar';
        const exitPos = p.side === Side.LONG ? 'aboveBar' : 'belowBar';
        markers.push({
          time: toUtc(p.entry_ts),
          position: entryPos,
          shape: p.side === Side.LONG ? 'arrowUp' : 'arrowDown',
          color: entryColor,
          text: isSelected ? 'Selected Entry' : 'Entry',
        });
        if (p.exit_ts) {
          markers.push({
            time: toUtc(p.exit_ts),
            position: exitPos,
            shape: p.side === Side.LONG ? 'arrowDown' : 'arrowUp',
            color: exitColor,
            text: isSelected ? 'Selected Exit' : 'Exit',
          });
        }
      });
      candlesSeries.setMarkers(markers);

      chart.timeScale().fitContent();

      // Resize handling
      ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          chart.applyOptions({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
        }
      });
      ro.observe(containerRef.current!);
    })();

    return () => {
      if (ro) ro.disconnect();
      chart.remove();
    };
  }, [selectedPosition, positions]);

  return <div className="w-full h-full" ref={containerRef} />;
};

export default LightweightTradeChart;