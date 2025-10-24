// Top-level imports
import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DashboardCard from '../components/DashboardCard';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Side, Strategy, LedgerEntry } from '../types';
import TradingViewWidget from '../components/TradingViewWidget';
import MarketSearchModal from '../components/MarketSearchModal';
import { SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { SearchIcon } from '../components/icons/Icons';
import { SchedulerActivity } from '../types';


const timeframes = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];

// Inside: const Dashboard: React.FC = () => {
const Dashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: positions, loading: positionsLoading } = useDatabase<Position[]>('positions');
  // Fix: Change Position[] to LedgerEntry[]
  const { data: ledger, loading: ledgerLoading } = useDatabase<LedgerEntry[]>('ledger');
  const { data: strategies, loading: strategiesLoading } = useDatabase<Strategy[]>('strategies');
  // Subscribe to scheduler activity document for Dashboard card
  const { data: schedulerActivity, loading: schedulerLoading, error: schedulerError } = useDatabase<SchedulerActivity>('scheduler', 'activity');
  
  // UI feature flags
  const ENABLE_MARKET_BROWSER = (import.meta.env.VITE_ENABLE_MARKET_BROWSER === '1' || import.meta.env.VITE_ENABLE_MARKET_BROWSER === 'true');
  const ENABLE_CHART = (import.meta.env.VITE_ENABLE_CHART === '1' || import.meta.env.VITE_ENABLE_CHART === 'true');
  
  // Autopilot flags (Vite env)
  const AUTOPILOT_ENABLED = (import.meta.env.VITE_AUTOPILOT_ENABLED === '1' || import.meta.env.VITE_AUTOPILOT_ENABLED === 'true');
  const AUTOPILOT_RISK_GBP = Number(import.meta.env.VITE_AUTOPILOT_RISK_GBP ?? '');
  
  
  const enabledStrategies = useMemo(() => {
    return strategies ? strategies.filter(s => s.enabled) : [];
  }, [strategies]);

  const uniqueInstruments = useMemo(() => {
    return [...new Set(enabledStrategies.map(s => s.symbol))];
  }, [enabledStrategies]);

  const uniqueMethods = useMemo(() => {
    return [...new Set(enabledStrategies.map(s => s.name))];
  }, [enabledStrategies]);
  
  // Initialize with state from location if available, otherwise use defaults.
  const [chartSymbol, setChartSymbol] = useState(location.state?.symbol || primaryStrategy?.symbol || 'AAPL');
  const [chartTimeframe, setChartTimeframe] = useState(location.state?.timeframe || primaryStrategy?.timeframe || '1D');
  const [isMarketModalOpen, setIsMarketModalOpen] = useState(false);
  
  // Session countdown state
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  
  // Effect to update the chart when navigating from the scanner.
  useEffect(() => {
    if (location.state?.symbol) {
      setChartSymbol(location.state.symbol);
      setChartTimeframe(location.state.timeframe || '1D');
    }
  }, [location.state]);
  
  const stats = useMemo(() => {
    if (positionsLoading || ledgerLoading || !positions || !ledger) {
      return { totalPnl: 0, winRate: 0, avgR: 0, tradeCount: 0, maxDrawdown: 0 };
    }
  
    const closed = positions.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null);
    const totalPnl = closed.reduce((acc, p) => acc + p.pnl_gbp, 0);
    const tradeCount = closed.length;
    const winningTrades = closed.filter(p => p.pnl_gbp > 0).length;
    const winRate = tradeCount > 0 ? (winningTrades / tradeCount) * 100 : 0;
    const totalR = closed.reduce((acc, p) => acc + (p.R_multiple || 0), 0);
    const avgR = tradeCount > 0 ? totalR / tradeCount : 0;
  
    let peak = 0;
    let maxDrawdown = 0;
    // Fix: ledger is now correctly typed as LedgerEntry[]
    ledger.forEach(entry => {
        peak = Math.max(peak, entry.cash_after);
        const drawdown = peak - entry.cash_after;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    });
  
    return { totalPnl, winRate, avgR, tradeCount, maxDrawdown };
  }, [positions, ledger, positionsLoading, ledgerLoading]);
  
  const chartData = useMemo(() => {
    if (ledgerLoading || !ledger || ledger.length === 0) return [{ name: 'Start', equity: 0, date: new Date().toLocaleDateString() }];
    return ledger.map((entry, index) => ({
      name: `Trade ${index + 1}`,
      equity: entry.cash_after,
      date: new Date(entry.ts).toLocaleDateString()
    }));
  }, [ledger, ledgerLoading]);
  
  // Helpers for session countdowns
  const formatUtcHourToLocal = (hour: number) => {
    const d = new Date();
    d.setUTCHours(hour, 0, 0, 0);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  const formatDuration = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };
  const isForexHours = (date: Date) => {
    const day = date.getUTCDay(); // 0=Sun
    const hour = date.getUTCHours();
    return day >= 1 && day <= 5 && hour >= 12 && hour < 20;
  };
  const isCryptoHours = (date: Date) => {
    const hour = date.getUTCHours();
    return hour >= 13 && hour < 22;
  };
  const nextForexStart = (date: Date) => {
    const d = new Date(date);
    let day = d.getUTCDay();
    let target = new Date(d);
    target.setUTCMinutes(0,0,0);
    if (day >= 1 && day <= 5 && d.getUTCHours() < 12) {
      target.setUTCHours(12);
    } else {
      // move to next weekday
      do {
        target.setUTCDate(target.getUTCDate() + 1);
        day = target.getUTCDay();
      } while (day === 0 || day === 6);
      target.setUTCHours(12);
    }
    return target;
  };
  const nextCryptoStart = (date: Date) => {
    const d = new Date(date);
    const target = new Date(d);
    target.setUTCMinutes(0,0,0);
    if (d.getUTCHours() < 13) {
      target.setUTCHours(13);
    } else {
      target.setUTCDate(target.getUTCDate() + 1);
      target.setUTCHours(13);
    }
    return target;
  };
  const forexEndToday = (date: Date) => {
    const t = new Date(date);
    t.setUTCHours(20,0,0,0);
    return t;
  };
  const cryptoEndToday = (date: Date) => {
    const t = new Date(date);
    t.setUTCHours(22,0,0,0);
    return t;
  };
  
  // Compute session progress percent (0–100)
  const sessionProgressPercent = (startHourUTC: number, endHourUTC: number, date: Date) => {
    const start = new Date(date); start.setUTCHours(startHourUTC, 0, 0, 0);
    const end = new Date(date); end.setUTCHours(endHourUTC, 0, 0, 0);
    const total = end.getTime() - start.getTime();
    const elapsed = date.getTime() - start.getTime();
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };
  
  // Recent trades and best summaries

  // Comparator: rank by total R (sum of R-multiples); tie-break by win rate
  const sortByRThenWinRate = (a: [string, { R: number; pnl: number; wins: number; count: number }], b: [string, { R: number; pnl: number; wins: number; count: number }]) => {
    if (b[1].R !== a[1].R) return b[1].R - a[1].R;
    const aWR = a[1].count ? a[1].wins / a[1].count : 0;
    const bWR = b[1].count ? b[1].wins / b[1].count : 0;
    return bWR - aWR;
  };
  const recentTrades = useMemo(() => {
    if (!positions) return [] as Required<Position>[];
    const closed = positions.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.exit_ts !== null);
    return closed
      .sort((a,b) => new Date(b.exit_ts!).getTime() - new Date(a.exit_ts!).getTime())
      .slice(0,5);
  }, [positions]);
  
  const bestSummaries = useMemo(() => {
    const closed = (positions || []).filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null);
    const bySymbol = new Map<string, { R: number; pnl: number; wins: number; count: number }>();
    const byMethod = new Map<string, { R: number; pnl: number; wins: number; count: number }>();
    closed.forEach(p => {
      const r = p.R_multiple || 0;
      const s = bySymbol.get(p.symbol) || { R: 0, pnl: 0, wins: 0, count: 0 };
      s.R += r; s.pnl += p.pnl_gbp!; s.count += 1; if (p.pnl_gbp! > 0) s.wins += 1; bySymbol.set(p.symbol, s);
      const key = p.method_name || 'Unknown';
      const m = byMethod.get(key) || { R: 0, pnl: 0, wins: 0, count: 0 };
      m.R += r; m.pnl += p.pnl_gbp!; m.count += 1; if (p.pnl_gbp! > 0) m.wins += 1; byMethod.set(key, m);
    });
    const bestInstrument = Array.from(bySymbol.entries()).sort(sortByRThenWinRate)[0];
    const bestMethod = Array.from(byMethod.entries()).sort(sortByRThenWinRate)[0];
    return {
      bestInstrument: bestInstrument ? { symbol: bestInstrument[0], R: bestInstrument[1].R, pnl: bestInstrument[1].pnl, winRate: bestInstrument[1].count ? (bestInstrument[1].wins/bestInstrument[1].count)*100 : 0 } : null,
      bestMethod: bestMethod ? { method: bestMethod[0], R: bestMethod[1].R, pnl: bestMethod[1].pnl, winRate: bestMethod[1].count ? (bestMethod[1].wins/bestMethod[1].count)*100 : 0 } : null,
    };
  }, [positions]);
  
  if (positionsLoading || ledgerLoading || strategiesLoading) {
    return <div className="text-center text-xl text-primary-light">Loading data...</div>;
  }
  
  return (
    <div className="space-y-6">
      <MarketSearchModal 
        isOpen={isMarketModalOpen}
        onClose={() => setIsMarketModalOpen(false)}
        onSelectSymbol={(symbol) => {
          setChartSymbol(symbol);
          setIsMarketModalOpen(false);
        }}
      />
      <h2 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6">
        <DashboardCard title="Total P&L" value={`£${stats.totalPnl.toFixed(2)}`} changeType={stats.totalPnl >= 0 ? 'positive' : 'negative'} />
        <DashboardCard title="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
        <DashboardCard title="Average R" value={`${stats.avgR.toFixed(2)}R`} />
        <DashboardCard title="Max Drawdown" value={`£${stats.maxDrawdown.toFixed(2)}`} />
        <DashboardCard title="Total Trades" value={stats.tradeCount} />
      </div>

      {/* Active Configuration summary */}
      <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Active Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">Instruments</p>
            <div className="flex flex-wrap gap-2">
              {SELECTED_INSTRUMENTS.map(m => (
                <span key={m.symbol} className="px-2 py-1 rounded-md bg-gray-700 text-gray-200 text-xs ring-1 ring-white/10">{m.symbol}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-2">Methods</p>
            <div className="flex flex-wrap gap-2">
              {SELECTED_METHODS.map(m => (
                <span key={m} className="px-2 py-1 rounded-md bg-gray-700 text-gray-200 text-xs ring-1 ring-white/10">{m}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-2">Autopilot</p>
            <div className="space-y-1 text-sm text-gray-300">
              <p>Status: <span className={AUTOPILOT_ENABLED ? 'text-green-300' : 'text-gray-400'}>{AUTOPILOT_ENABLED ? 'Enabled' : 'Disabled'}</span></p>
              {AUTOPILOT_RISK_GBP ? <p>Risk/trade: £{AUTOPILOT_RISK_GBP}</p> : null}
              
            </div>
          </div>
        </div>
      </div>

      {/* Session Countdown */}
      <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900/50 p-3 sm:p-4 rounded-lg">
            <h4 className="font-bold text-white mb-2">Forex</h4>
            <p className="text-sm text-gray-400">Optimal: {formatUtcHourToLocal(12)} - {formatUtcHourToLocal(20)} (Mon-Fri)</p>
            {isForexHours(now) ? (
                <>
                  <p className="text-green-300 mt-2">Open • Closes in {formatDuration(forexEndToday(now).getTime() - now.getTime())}</p>
                  <div className="mt-2 h-2 bg-gray-700 rounded">
                    <div className="h-2 bg-primary-dark rounded" style={{ width: `${sessionProgressPercent(12,20,now)}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-300 mt-2">Opens in {formatDuration(nextForexStart(now).getTime() - now.getTime())}</p>
                  <div className="mt-2 h-2 bg-gray-700 rounded">
                    <div className="h-2 bg-gray-500 rounded" style={{ width: `0%` }} />
                  </div>
                </>
              )}
          </div>
          <div className="bg-gray-900/50 p-3 sm:p-4 rounded-lg">
            <h4 className="font-bold text-white mb-2">Crypto</h4>
            <p className="text-sm text-gray-400">Optimal: {formatUtcHourToLocal(13)} - {formatUtcHourToLocal(22)} (Daily)</p>
            {isCryptoHours(now) ? (
                <>
                  <p className="text-green-300 mt-2">Open • Closes in {formatDuration(cryptoEndToday(now).getTime() - now.getTime())}</p>
                  <div className="mt-2 h-2 bg-gray-700 rounded">
                    <div className="h-2 bg-primary-dark rounded" style={{ width: `${sessionProgressPercent(13,22,now)}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-300 mt-2">Opens in {formatDuration(nextCryptoStart(now).getTime() - now.getTime())}</p>
                  <div className="mt-2 h-2 bg-gray-700 rounded">
                    <div className="h-2 bg-gray-500 rounded" style={{ width: `0%` }} />
                  </div>
                </>
              )}
          </div>
        </div>
      </div>

      {/* Optional Market browser */}
      {ENABLE_MARKET_BROWSER && (
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <label htmlFor="symbol-input" className="font-semibold text-gray-300">Market:</label>
          <div className="inline-flex items-stretch rounded-xl overflow-hidden ring-1 ring-white/10 bg-gray-700">
            <input 
              id="symbol-input"
              type="text"
              value={chartSymbol}
              onChange={e => setChartSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              className="bg-gray-700 text-white placeholder-gray-400 focus:outline-none w-full md:w-48 h-11 px-3"
            />
            <button
              onClick={() => setIsMarketModalOpen(true)}
              className="px-4 bg-gray-600 hover:bg-gray-500 text-gray-200 flex items-center justify-center h-11 border-l border-white/10 transition"
              aria-label="Browse markets"
            >
              <SearchIcon />
            </button>
          </div>
          <label htmlFor="timeframe-select" className="font-semibold text-gray-300">Timeframe:</label>
          <select 
            id="timeframe-select"
            value={chartTimeframe}
            onChange={e => setChartTimeframe(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-primary focus:border-primary text-white h-10"
          >
            {timeframes.map(tf => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </div>
      )}

      {/* Chart layout */}
      {ENABLE_CHART && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 h-[320px] sm:h-[420px] lg:h-[500px]">
          <div className="lg:col-span-3 bg-gray-800 p-1 rounded-lg shadow-lg">
            {chartSymbol ? (
              <TradingViewWidget key={`${chartSymbol}-${chartTimeframe}`} symbol={chartSymbol} timeframe={chartTimeframe} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">Enter a symbol to see a live chart.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Equity Curve */}
       <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Equity Curve</h3>
        <div className="w-full h-[220px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                labelStyle={{ color: '#F3F4F6' }}
              />
              <Legend />
              <Line type="monotone" dataKey="equity" stroke="#34D399" strokeWidth={2} dot={false} name="Equity (£)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Best & Recent */}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg lg:col-span-1">
          <h3 className="text-lg font-semibold text-white mb-4">Best Performance</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-gray-400">Instrument</p>
              {bestSummaries.bestInstrument ? (
                <p className="font-mono">{bestSummaries.bestInstrument.symbol} • {bestSummaries.bestInstrument.R.toFixed(2)}R • £{bestSummaries.bestInstrument.pnl.toFixed(2)} • {bestSummaries.bestInstrument.winRate.toFixed(1)}%</p>
              ) : (
                <p className="text-gray-500">No closed trades yet.</p>
              )}
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-gray-400">Method</p>
              {bestSummaries.bestMethod ? (
                <p className="font-mono">{bestSummaries.bestMethod.method} • {bestSummaries.bestMethod.R.toFixed(2)}R • £{bestSummaries.bestMethod.pnl.toFixed(2)} • {bestSummaries.bestMethod.winRate.toFixed(1)}%</p>
              ) : (
                <p className="text-gray-500">No closed trades yet.</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentTrades.length === 0 && (
              <p className="text-gray-500">No recent closed trades.</p>
            )}
            {recentTrades.map(rt => (
              <div key={rt.id} onClick={() => navigate(`/positions/${rt.id}`)} className="bg-gray-900/40 rounded p-3 sm:p-4 flex justify-between items-center cursor-pointer hover:bg-gray-900/60 transition">
                <div>
                  <p className="text-white font-semibold">{rt.symbol}</p>
                  <p className="text-xs text-gray-400">{new Date(rt.exit_ts!).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{rt.method_name || '—'}</p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 text-xs rounded ${rt.side === Side.LONG ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{rt.side}</span>
                  <p className={`mt-2 font-mono ${rt.pnl_gbp! >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{rt.pnl_gbp!.toFixed(2)} • {rt.R_multiple?.toFixed(2)}R</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scheduler Activity */}
      <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Scheduler Activity</h3>
        {schedulerError ? (
          <p className="text-red-300">Failed to load scheduler: {schedulerError}</p>
        ) : schedulerLoading ? (
          <p className="text-gray-400">Loading scheduler status...</p>
        ) : schedulerActivity ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
            <div>
              <p className="text-gray-400">Last Run</p>
              <p className="font-mono">{Number.isFinite(Number(schedulerActivity.last_run_ts)) ? new Date(Number(schedulerActivity.last_run_ts)).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Window</p>
              <p className="font-mono capitalize">{schedulerActivity.window}</p>
            </div>
            <div>
              <p className="text-gray-400">Trades Placed</p>
              <p className="font-mono">{schedulerActivity.trades_placed}</p>
            </div>
            <div className="md:col-span-3">
              <p className="text-gray-400 mb-2">Universe</p>
              <div className="flex flex-wrap gap-2">
                {(schedulerActivity.universe_symbols || []).map(sym => (
                  <span key={sym} className="px-2 py-1 rounded-md bg-gray-700 text-gray-200 text-xs ring-1 ring-white/10">{sym}</span>
                ))}
              </div>
            </div>
            {schedulerActivity.messages && schedulerActivity.messages.length > 0 && (
              <div className="md:col-span-3">
                <p className="text-gray-400 mb-2">Messages</p>
                <ul className="list-disc list-inside text-gray-300 space-y-1">
                  {schedulerActivity.messages.slice(-5).map((m, idx) => (
                    <li key={idx} className="font-mono text-xs">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400">No scheduler activity recorded yet.</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;