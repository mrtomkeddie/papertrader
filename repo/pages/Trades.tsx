import React from 'react';
import { useDatabase } from '../hooks/useDatabase';
import * as db from '../services/database';
import { Position, Side, PositionStatus } from '../types';
import { Link } from 'react-router-dom';
import DatePicker from '../components/DatePicker';

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
      <div className="sm:static sticky top-0 z-10 relative px-5 sm:px-6 py-4 sm:py-5 card-premium rounded-lg shadow-lg">
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-white/5 via-transparent to-white/5" />
        <div className="relative z-10">
          <h3 className="text-sm font-semibold text-primary-light mb-2">Filters</h3>
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
               <div className="overflow-x-auto no-scrollbar -mx-1">
                 <div className="flex items-center gap-3 px-1">
                   <div className="flex-1 w-full sm:w-56">
                      <label htmlFor="quickRange" className="sr-only">Quick range</label>
                      <div className="relative">
                        <select
                          id="quickRange"
                          value={quickRange}
                          onChange={(e) => setQuickRange(e.target.value as 'all'|'today'|'7d'|'30d'|'month')}
                          className="appearance-none w-full searchbar rounded px-3.5 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-[rgba(34,211,150,0.35)]"
                        >
                          <option value="all">All</option>
                          <option value="today">Today</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                          <option value="month">This month</option>
                        </select>
                        <svg
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300"
                          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                        >
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.27a.75.75 0 01-.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                   <button onClick={clearFilters} className="px-4 py-2 text-sm leading-5 font-medium rounded bg-[rgba(24,24,24,0.9)] text-white ring-1 ring-white/10 hover:bg-[rgba(24,24,24,0.75)] transition-colors">Clear</button>
                   <button onClick={() => setFiltersExpanded(v => !v)} className="sm:hidden px-4 py-2 text-sm leading-5 font-medium rounded bg-[rgba(24,24,24,0.9)] text-white ring-1 ring-white/10 hover:bg-[rgba(24,24,24,0.75)] transition-colors">
                     {filtersExpanded ? 'Hide filters' : 'More filters'}
                   </button>
                 </div>
               </div>
               {/* Divider between quick filters and date inputs (desktop) */}
               {/* Desktop date range inline */}
               <div className="hidden sm:grid sm:grid-cols-2 sm:gap-3 sm:pl-3">
                 <div className="flex flex-col">
                   <DatePicker label="Start date" value={startDate} onChange={setStartDate} />
                 </div>
                 <div className="flex flex-col">
                   <DatePicker label="End date" value={endDate} onChange={setEndDate} />
                 </div>
               </div>
             </div>
             {/* Divider before mobile date inputs */}
             <div className="sm:hidden h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mt-3 mb-2" />
             {/* Mobile date range collapsible */}
             <div className={`${filtersExpanded ? 'grid' : 'hidden'} grid-cols-2 gap-3 mt-3 sm:hidden`}>
               <div className="flex flex-col">
                 <DatePicker label="Start date" value={startDate} onChange={setStartDate} />
               </div>
               <div className="flex flex-col">
                 <DatePicker label="End date" value={endDate} onChange={setEndDate} />
               </div>
             </div>
        </div>
      </div>
      {/* Mobile: card list */}
      <div className="block md:hidden">
        <div className="space-y-3">
          {filteredPositions.map(pos => (
            <Link to={`/positions/${pos.id}`} key={pos.id} className="card-premium rounded-lg sm:rounded-xl p-3 sm:p-4 flex justify-between items-center hover:bg-[rgba(24,24,24,0.72)] hover:ring-1 hover:ring-white/10 transition">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{pos.symbol}</span>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${pos.side === Side.LONG ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{pos.side}</span>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${pos.status === PositionStatus.OPEN ? 'bg-[rgba(255,255,255,0.06)] text-gray-200' : 'bg-[rgba(255,255,255,0.12)] text-gray-300'}`}>{pos.status}</span>
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
      <div className="card-premium rounded-lg shadow-lg overflow-x-auto hidden md:block">
        <table className="min-w-full table-premium">
          <thead>
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
          <tbody className="bg-transparent divide-y divide-white/10">
            {filteredPositions.map(pos => (
              <tr key={pos.id} className="hover:bg-[rgba(24,24,24,0.6)]">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">{pos.symbol}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${pos.side === Side.LONG ? 'text-green-400' : 'text-red-400'}`}>{pos.side}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{new Date(pos.entry_ts).toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{pos.entry_price.toFixed(4)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{pos.method_name || (pos.strategy_id === 'ai-generated' ? 'AI' : '—')}</td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${pos.pnl_gbp === null ? 'text-gray-400' : pos.pnl_gbp >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pos.pnl_gbp !== null ? pos.pnl_gbp.toFixed(2) : 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${pos.status === PositionStatus.OPEN ? 'bg-[rgba(255,255,255,0.06)] text-gray-200' : 'bg-[rgba(255,255,255,0.12)] text-gray-300'}`}>{pos.status}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  <Link to={`/positions/${pos.id}`} className="text-gray-300 hover:text-gray-200">View</Link>
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