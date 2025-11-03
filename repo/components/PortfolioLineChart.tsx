import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineData, UTCTimestamp } from 'lightweight-charts';
import { LedgerEntry } from '../types';

interface Props {
  ledger: LedgerEntry[];
}

function toUtcSeconds(ts: string): UTCTimestamp {
  return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
}

const PortfolioLineChart: React.FC<Props> = ({ ledger }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: '#121212' }, textColor: '#D1D5DB' },
      grid: { vertLines: { color: '#1F2937' }, horzLines: { color: '#1F2937' } },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151' },
    });

    const series = chart.addAreaSeries({
      lineColor: '#22c55e',
      topColor: 'rgba(34,197,94,0.25)',
      bottomColor: 'rgba(34,197,94,0.05)',
    });

    const sorted = [...(ledger || [])].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const data: LineData[] = sorted.map((l) => ({ time: toUtcSeconds(l.ts), value: Number(l.cash_after) }));
    if (data.length > 0) series.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        chart.applyOptions({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
      }
    });
    ro.observe(ref.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [ledger]);

  return <div ref={ref} className="w-full h-full" />;
};

export default PortfolioLineChart;