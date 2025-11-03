import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, CandlestickData, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { Position, Side } from '../types';
import { useDatabase } from '../hooks/useDatabase';
import { fetchOHLCV } from '../services/dataService';

interface LightweightTradeChartProps {
  selectedPosition: Position;
}

const toUtc = (iso: string): UTCTimestamp => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
};

async function fetchCandlesForSymbol(symbol: string, limit: number = 200): Promise<CandlestickData[]> {
  try {
    const ohlcv = await fetchOHLCV(symbol, '1h', limit);
    return ohlcv.map(c => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  } catch (e) {
    // Fallback: synthetic candles centered around current time
    const now = Math.floor(Date.now() / 1000);
    const base = 1.0;
    const candles: CandlestickData[] = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = (now - i * 3600) as UTCTimestamp; // 1h steps
      const drift = Math.sin(i / 10) * 0.002;
      const open = Math.max(0.0001, base + drift + (Math.random() - 0.5) * 0.002);
      const close = Math.max(0.0001, base + drift + (Math.random() - 0.5) * 0.002);
      const high = Math.max(open, close) + Math.random() * 0.0015;
      const low = Math.min(open, close) - Math.random() * 0.0015;
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
      layout: { background: { type: ColorType.Solid, color: '#121212' }, textColor: '#D1D5DB' },
      grid: { vertLines: { color: '#1f1f1f' }, horzLines: { color: '#1f1f1f' } },
      rightPriceScale: { borderColor: '#2a2a2a' },
      timeScale: { borderColor: '#2a2a2a' },
      crosshair: { mode: 1 },
    });

    const candlesSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });

    let ro: ResizeObserver | null = null;

    (async () => {
      const candles = await fetchCandlesForSymbol(selectedPosition.symbol, 200);
      candlesSeries.setData(candles);

      // Price lines for selected trade entry/stop/tp
      if (selectedPosition) {
        // Entry line with timestamp in title
        candlesSeries.createPriceLine({
          price: selectedPosition.entry_price,
          color: selectedPosition.side === Side.LONG ? '#22c55e' : '#ef4444',
          lineStyle: LineStyle.Solid,
          lineWidth: 2,
          axisLabelVisible: true,
          title: `Entry • ${formatDateTime(selectedPosition.entry_ts)}`,
        });
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

      // Build markers from all positions for the same symbol as selected
      const markers: Parameters<ISeriesApi<'Candlestick'>['setMarkers']>[0] = [];
      (positions || []).filter(p => p.symbol === selectedPosition.symbol).forEach(p => {
        const isSelected = p.id === selectedPosition.id;
        const entryColor = isSelected ? '#fbbf24' : (p.side === Side.LONG ? '#22c55e' : '#ef4444');
        const exitColor = isSelected ? '#e5e7eb' : '#a1a1aa';
        const entryPos = p.side === Side.LONG ? 'belowBar' : 'aboveBar';
        const exitPos = p.side === Side.LONG ? 'aboveBar' : 'belowBar';
        markers.push({
          time: toUtc(p.entry_ts),
          position: entryPos,
          shape: p.side === Side.LONG ? 'arrowUp' : 'arrowDown',
          color: entryColor,
          text: `${isSelected ? 'Selected Entry' : 'Entry'}\n${formatDateTime(p.entry_ts)}`,
        });
        if (p.exit_ts) {
          markers.push({
            time: toUtc(p.exit_ts),
            position: exitPos,
            shape: p.side === Side.LONG ? 'arrowDown' : 'arrowUp',
            color: exitColor,
            text: `${isSelected ? 'Selected Exit' : 'Exit'}\n${formatDateTime(p.exit_ts)}`,
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