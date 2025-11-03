import React, { useMemo } from 'react';
import { LedgerEntry } from '../types';

interface Props {
  ledger: LedgerEntry[];
  range: 'today' | 'week' | 'all';
  height?: number;
}

const EquitySparkline: React.FC<Props> = ({ ledger, range, height = 44 }) => {
  const startOfToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const startOfWeek = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); const day = d.getDay(); const diff = (day + 6) % 7; d.setDate(d.getDate() - diff); return d; }, []);
  const inRange = (ts?: string | number | Date) => {
    if (!ts) return false; const t = new Date(ts);
    if (range === 'today') return t >= startOfToday;
    if (range === 'week') return t >= startOfWeek;
    return true;
  };

  const points = useMemo(() => {
    const entries = (ledger || [])
      .filter(e => inRange(e.ts))
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    if (entries.length === 0) return [] as number[];
    const vals = entries.map(e => e.cash_after ?? 0);
    return vals;
  }, [ledger, range]);

  if (points.length === 0) {
    return <div className="text-xs text-gray-400">No equity data</div>;
  }

  const width = 220;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = 4;
  const scaleY = (v: number) => {
    if (max === min) return height / 2; // flat line if no variance
    return pad + ((v - min) / (max - min)) * (height - pad * 2);
  };
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const path = points.map((v, i) => `${pad + i * stepX},${height - scaleY(v)}`).join(' ');

  const rising = points[points.length - 1] >= points[0];
  const color = rising ? '#34d399' : '#f87171';

  return (
    <div className="flex items-center gap-3">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline points={path} fill="none" stroke={color} strokeWidth="2" />
      </svg>
      <div className="text-xs text-gray-400">Equity trend ({range})</div>
    </div>
  );
};

export default EquitySparkline;