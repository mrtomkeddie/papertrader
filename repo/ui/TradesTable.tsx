import React from 'react';
import { Position, PositionStatus, Side } from '../types';

interface TradesTableProps {
  positions: Position[];
}

const TradesTable: React.FC<TradesTableProps> = ({ positions }) => {
  const last20 = [...positions]
    .sort((a, b) => new Date(b.exit_ts ?? b.entry_ts ?? b.ts).getTime() - new Date(a.exit_ts ?? a.entry_ts ?? a.ts).getTime())
    .slice(0, 20);

  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString() : '—';

  return (
    <div className="card-premium p-4 rounded-lg shadow-lg overflow-x-auto">
      <h3 className="text-lg font-semibold text-white mb-3">Recent Trades</h3>
      <table className="min-w-full table-premium">
        <thead>
          <tr>
            <th className="text-left">Date</th>
            <th className="text-left">Symbol</th>
            <th className="text-left">Side</th>
            <th className="text-left">Strategy</th>
            <th className="text-left">P&L (GBP)</th>
            <th className="text-left">R Multiple</th>
            <th className="text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {last20.map(p => (
            <tr key={p.id}>
              <td>{fmtDate(p.exit_ts ?? p.entry_ts)}</td>
              <td>{p.symbol}</td>
              <td className={p.side === Side.LONG ? 'text-green-300' : 'text-red-300'}>{p.side}</td>
              <td>{p.method_name ?? p.strategy_id ?? '—'}</td>
              <td className={(p.pnl_gbp ?? 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{p.pnl_gbp != null ? p.pnl_gbp.toFixed(2) : '—'}</td>
              <td>{p.R_multiple != null ? p.R_multiple.toFixed(2) : '—'}</td>
              <td>{p.status}</td>
            </tr>
          ))}
          {last20.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-gray-400 py-6">No trades found for this filter.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TradesTable;