import React, { useMemo, useState } from 'react';
import { Position, PositionStatus, Side } from '../types';

interface Props {
  positions: Position[];
}

type SortKey = 'time' | 'pnl' | 'r' | 'symbol';

const RecentTradesCard: React.FC<Props> = ({ positions }) => {
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const closed = useMemo(() => {
    const list = (positions || [])
      .filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null)
      .sort((a, b) => new Date(b.exit_ts ?? b.ts).getTime() - new Date(a.exit_ts ?? a.ts).getTime())
      .slice(0, 50); // allow sorting over a larger recent window
    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      if (sortBy === 'time') {
        const ta = new Date(a.exit_ts ?? a.ts).getTime();
        const tb = new Date(b.exit_ts ?? b.ts).getTime();
        return (ta - tb) * dir;
      }
      if (sortBy === 'pnl') {
        const pa = a.pnl_gbp ?? 0; const pb = b.pnl_gbp ?? 0;
        return (pa - pb) * dir;
      }
      if (sortBy === 'r') {
        const ra = a.R_multiple ?? 0; const rb = b.R_multiple ?? 0;
        return (ra - rb) * dir;
      }
      const sa = (a.symbol || '').localeCompare(b.symbol || '');
      return sa * dir;
    });
    return sorted.slice(0, 10);
  }, [positions, sortBy, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const fmtTime = (ts?: string | number | Date) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Recent Trades</h3>
        <div className="flex gap-2 text-xs">
          <button onClick={() => toggleSort('time')} className={`px-2 py-1 rounded ${sortBy==='time'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>Time</button>
          <button onClick={() => toggleSort('pnl')} className={`px-2 py-1 rounded ${sortBy==='pnl'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>P&L</button>
          <button onClick={() => toggleSort('r')} className={`px-2 py-1 rounded ${sortBy==='r'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>Risk-Reward</button>
          <button onClick={() => toggleSort('symbol')} className={`px-2 py-1 rounded ${sortBy==='symbol'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>Symbol</button>
        </div>
      </div>
      <table className="min-w-full table-premium text-sm">
        <thead>
          <tr>
            <th className="text-left text-[11px] tracking-wide text-gray-400">Time</th>
            <th className="text-left text-[11px] tracking-wide text-gray-400">Bot</th>
            <th className="text-left text-[11px] tracking-wide text-gray-400">Symbol</th>
            <th className="text-left text-[11px] tracking-wide text-gray-400">Side</th>
            <th className="text-right text-[11px] tracking-wide text-gray-400">P&L (£)</th>
            <th className="text-right text-[11px] tracking-wide text-gray-400">Risk-Reward</th>
          </tr>
        </thead>
        <tbody>
          {closed.length === 0 && (
            <tr><td colSpan={6} className="text-center text-gray-400 py-3">No recent trades.</td></tr>
          )}
          {closed.map((p) => (
            <tr key={p.id || `${p.symbol}-${p.ts}`} className="border-t border-white/5">
              <td className="py-2">{fmtTime(p.exit_ts ?? p.ts)}</td>
              <td className="py-2 text-gray-300">{(p.method_name ?? p.strategy_id ?? 'Bot')}</td>
              <td className="py-2 font-mono">{p.symbol}</td>
              <td className="py-2 text-gray-300">{p.side === Side.LONG ? 'Long' : 'Short'}</td>
              <td className={`py-2 text-right font-mono ${((p.pnl_gbp ?? 0) >= 0) ? 'text-accent' : 'text-red-300'}`}>£{(p.pnl_gbp ?? 0).toFixed(2)}</td>
              <td className="py-2 text-right font-mono">{(p.R_multiple ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RecentTradesCard;