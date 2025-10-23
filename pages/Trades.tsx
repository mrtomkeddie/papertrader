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
  const [quickRange, setQuickRange] = React.useState<'all'|'today'|'7d'|'30d'|'month'>('all');
  const [filtersExpanded, setFiltersExpanded] = React.useState<boolean>(false);

  const currentFilterLabel = React.useMemo(() => {
    if (startDate || endDate) {
      const fmt = (s?: string) => s ? new Date(s).toLocaleDateString() : '—';
      return `${fmt(startDate)} → ${fmt(endDate)}`;
    }
    const map: Record<typeof quickRange, string> = {
      all: 'All',
      today: 'Today',
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      month: 'This month',
    } as const;
    return map[quickRange];
  }, [startDate, endDate, quickRange]);

  const filteredPositions = React.useMemo(() => {
    if (!sortedPositions) return [];

    // Manual date range overrides quick range
    const hasManual = !!startDate || !!endDate;
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (hasManual) {
      start = startDate ? new Date(startDate) : null;
      end = endDate ? new Date(endDate) : null;
    } else {
      switch (quickRange) {
        case 'today': {
          const s = new Date(now);
          s.setHours(0,0,0,0);
          const e = new Date(now);
          e.setHours(23,59,59,999);
          start = s; end = e;
          break;
        }
        case '7d': {
          const s = new Date(now);
          s.setDate(s.getDate() - 7);
          s.setHours(0,0,0,0);
          const e = new Date(now);
          e.setHours(23,59,59,999);
          start = s; end = e;
          break;
        }
        case '30d': {
          const s = new Date(now);
          s.setDate(s.getDate() - 30);
          s.setHours(0,0,0,0);
          const e = new Date(now);
          e.setHours(23,59,59,999);
          start = s; end = e;
          break;
        }
        case 'month': {
          const s = new Date(now.getFullYear(), now.getMonth(), 1);
          s.setHours(0,0,0,0);
          const e = new Date(now);
          e.setHours(23,59,59,999);
          start = s; end = e;
          break;
        }
        case 'all':
        default:
          start = null; end = null;
      }
    }

    return sortedPositions.filter(pos => {
      const d = new Date(pos.entry_ts);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [sortedPositions, startDate, endDate, quickRange]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setQuickRange('all');
  };

  if (loading) {
    return <div className="text-center text-xl text-primary-light">Loading trades...</div>;
  }

  if (error) {
    return <div className="text-center text-xl text-red-400">Error loading trades: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-white">All Trades</h2>

      {/* Filter bar */}
      <div className="sm:static sticky top-0 z-10 -mx-4 px-4 py-2 bg-gray-900/80 backdrop-blur rounded md:rounded-none">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1">
            <div className="inline-flex gap-2 px-1 whitespace-nowrap">
              {[
                {key: 'all', label: 'All'},
                {key: 'today', label: 'Today'},
                {key: '7d', label: 'Last 7 days'},
                {key: '30d', label: 'Last 30 days'},
                {key: 'month', label: 'This month'},
              ].map(({key, label}) => (
                <button
                  key={key}
                  onClick={() => setQuickRange(key as 'all'|'today'|'7d'|'30d'|'month')}
                  className={`px-3 py-1.5 text-xs rounded-full border border-white/10 ${quickRange === key ? 'bg-primary-dark text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
                >
                  {label}
                </button>
              ))}
              <button onClick={clearFilters} className="px-3 py-1.5 text-xs rounded-full bg-gray-700 text-white hover:bg-gray-600">Clear</button>
              <button onClick={() => setFiltersExpanded(v => !v)} className="sm:hidden px-3 py-1.5 text-xs rounded-full bg-gray-700 text-white hover:bg-gray-600">
                {filtersExpanded ? 'Hide filters' : 'More filters'}
              </button>
            </div>
          </div>
          {/* Desktop date range inline */}
          <div className="hidden sm:grid sm:grid-cols-2 sm:gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-gray-400">Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-900 text-gray-200 rounded px-2 py-1" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-400">End date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-900 text-gray-200 rounded px-2 py-1" />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Showing: {currentFilterLabel}</p>
        {/* Mobile date range collapsible */}
        <div className={`${filtersExpanded ? 'grid' : 'hidden'} grid-cols-2 gap-3 mt-3 sm:hidden`}>
          <div className="flex flex-col">
            <label className="text-xs text-gray-400">Start date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-900 text-gray-200 rounded px-2 py-2" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-400">End date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-900 text-gray-200 rounded px-2 py-2" />
          </div>
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="block md:hidden">
        <div className="space-y-3">
          {filteredPositions.map(pos => (
            <Link to={`/positions/${pos.id}`} key={pos.id} className="bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 flex justify-between items-center hover:bg-gray-700/60 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{pos.symbol}</span>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${pos.side === Side.LONG ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{pos.side}</span>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${pos.status === PositionStatus.OPEN ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>{pos.status}</span>
                </div>
                <p className="text-sm text-gray-400">
                  {new Date(pos.entry_ts).toLocaleDateString()} • {pos.method_name || (pos.strategy_id === 'ai-generated' ? 'AI' : '—')}
                </p>
              </div>
              <div className={`text-right text-sm font-semibold ${pos.pnl_gbp === null ? 'text-gray-400' : pos.pnl_gbp >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pos.pnl_gbp !== null ? `£${pos.pnl_gbp.toFixed(2)}` : 'N/A'}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Desktop: table */}
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-x-auto hidden md:block">
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