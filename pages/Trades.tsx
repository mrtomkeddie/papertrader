import React from 'react';
import { useDatabase } from '../hooks/useDatabase';
import * as db from '../services/database';
import { Position, Side, PositionStatus } from '../types';
import { Link } from 'react-router-dom';

const Trades: React.FC = () => {
  const { data: positions, loading, error } = useDatabase<Position[]>('positions');
  
  const sortedPositions = React.useMemo(() => {
    if (!positions) return [];
    return [...positions].sort((a,b) => new Date(b.entry_ts).getTime() - new Date(a.entry_ts).getTime());
  }, [positions]);

  // Date filter state
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');

  const filteredPositions = React.useMemo(() => {
    if (!sortedPositions) return [];
    if (!startDate && !endDate) return sortedPositions;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return sortedPositions.filter(pos => {
      const d = new Date(pos.entry_ts);
      if (start && d < new Date(start.setHours(0,0,0,0))) return false;
      if (end && d > new Date(end.setHours(23,59,59,999))) return false;
      return true;
    });
  }, [sortedPositions, startDate, endDate]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return <div className="text-center text-xl text-primary-light">Loading trades...</div>;
  }

  if (error) {
    return <div className="text-center text-xl text-red-400">Error loading trades: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h2 className="text-3xl font-bold text-white">All Trades</h2>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-400">Start date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-900 text-gray-200 rounded px-2 py-1" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-400">End date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-900 text-gray-200 rounded px-2 py-1" />
          </div>
          <button onClick={clearFilters} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white">Clear</button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Symbol</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Side</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Entry Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Entry Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Method</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">P&L</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {filteredPositions.map(pos => (
              <tr key={pos.id} className="hover:bg-gray-700/50">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">{pos.symbol}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${pos.side === Side.LONG ? 'text-green-400' : 'text-red-400'}`}>{pos.side}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{new Date(pos.entry_ts).toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{pos.entry_price.toFixed(4)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{pos.method_name || (pos.strategy_id === 'ai-generated' ? 'AI' : '—')}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${pos.pnl_gbp === null ? 'text-gray-400' : pos.pnl_gbp >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pos.pnl_gbp !== null ? pos.pnl_gbp.toFixed(2) : 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${pos.status === PositionStatus.OPEN ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>{pos.status}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  <Link to={`/positions/${pos.id}`} className="text-blue-400 hover:text-blue-300">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Trades;