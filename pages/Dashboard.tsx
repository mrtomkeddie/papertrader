// Top-level imports
import React, { useMemo, useState, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Strategy, LedgerEntry } from '../types';
import { SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { SchedulerActivity } from '../types';

// Clean Dashboard: Performance Snapshot, Active Configuration, Session Countdown
const Dashboard: React.FC = () => {
  const { data: positions, loading: positionsLoading } = useDatabase<Position[]>('positions');
  const { data: ledger, loading: ledgerLoading } = useDatabase<LedgerEntry[]>('ledger');
  const { data: strategies, loading: strategiesLoading } = useDatabase<Strategy[]>('strategies');
  const { data: schedulerActivity } = useDatabase<SchedulerActivity>('scheduler', 'activity');

  // Autopilot flags (Vite env)
  const AUTOPILOT_ENABLED = (import.meta.env.VITE_AUTOPILOT_ENABLED === '1' || import.meta.env.VITE_AUTOPILOT_ENABLED === 'true');
  const AUTOPILOT_RISK_GBP = Number(import.meta.env.VITE_AUTOPILOT_RISK_GBP ?? (import.meta.env as any).AUTOPILOT_RISK_GBP ?? '5');
  const windowName = schedulerActivity?.window ?? 'none';
  const autopilotActive = AUTOPILOT_ENABLED && windowName !== 'none';
  const autopilotLabel = AUTOPILOT_ENABLED ? (windowName !== 'none' ? `Enabled (${windowName})` : 'Disabled') : 'Disabled';

  const enabledStrategies = useMemo(() => strategies ? strategies.filter(s => s.enabled) : [], [strategies]);

  // Strategy filter
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');

  // Session countdown state
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Stats
  const stats = useMemo(() => {
    if (positionsLoading || ledgerLoading || !positions || !ledger) {
      return { totalPnl: 0, winRate: 0, avgR: 0, tradeCount: 0, maxDrawdown: 0, profitFactor: 0 };
    }
    const closedAll = positions.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null);
    const closed = selectedStrategy === 'all' ? closedAll : closedAll.filter(p => (p.strategy_id ?? '') === selectedStrategy);
    const totalPnl = closed.reduce((acc, p) => acc + p.pnl_gbp, 0);
    const tradeCount = closed.length;
    const winningTrades = closed.filter(p => p.pnl_gbp > 0).length;
    const winRate = tradeCount > 0 ? (winningTrades / tradeCount) * 100 : 0;
    const totalR = closed.reduce((acc, p) => acc + (p.R_multiple || 0), 0);
    const avgR = tradeCount > 0 ? totalR / tradeCount : 0;

    const winsSum = closed.filter(p => (p.pnl_gbp ?? 0) > 0).reduce((a, p) => a + (p.pnl_gbp ?? 0), 0);
    const lossesAbs = closed.filter(p => (p.pnl_gbp ?? 0) < 0).reduce((a, p) => a + Math.abs(p.pnl_gbp ?? 0), 0);
    const profitFactor = lossesAbs > 0 ? winsSum / lossesAbs : 0;

    let peak = 0; let maxDrawdown = 0;
    ledger.forEach(entry => { peak = Math.max(peak, entry.cash_after); const dd = peak - entry.cash_after; if (dd > maxDrawdown) maxDrawdown = dd; });

    return { totalPnl, winRate, avgR, tradeCount, maxDrawdown, profitFactor };
  }, [positions, ledger, positionsLoading, ledgerLoading]);

  // Dynamic account balance: base account + latest realized cash from ledger
  const baseAccountGbp = Number(import.meta.env.VITE_AUTOPILOT_ACCOUNT_GBP ?? 250);
  const latestCashAfter = useMemo(() => {
    if (ledgerLoading || !ledger || ledger.length === 0) return 0;
    // ledger loaded ascending by ts in useDatabase initial fetch; safeguard with sort
    const sorted = [...ledger].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return sorted[sorted.length - 1].cash_after || 0;
  }, [ledger, ledgerLoading]);
  const accountBalance = useMemo(() => baseAccountGbp + latestCashAfter, [baseAccountGbp, latestCashAfter]);

  // Recent trades (last 20) filtered by selected strategy
  const recentTrades = useMemo(() => {
    if (!positions || positions.length === 0) return [] as Position[];
    const sorted = [...positions].sort((a, b) => {
      const ta = new Date(a.entry_ts ?? a.created_ts ?? 0).getTime();
      const tb = new Date(b.entry_ts ?? b.created_ts ?? 0).getTime();
      return tb - ta;
    });
    const filtered = selectedStrategy === 'all' ? sorted : sorted.filter(p => (p.strategy_id ?? '') === selectedStrategy);
    return filtered.slice(0, 20);
  }, [positions, selectedStrategy]);

  // Helpers for session countdowns
  const formatUtcHourToLocal = (hour: number) => { const d = new Date(); d.setUTCHours(hour, 0, 0, 0); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const formatDuration = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };
  const isForexHours = (date: Date) => { const day = date.getUTCDay(); const hour = date.getUTCHours(); return day >= 1 && day <= 5 && hour >= 12 && hour < 20; };
  const nextForexStart = (date: Date) => { const d = new Date(date); let day = d.getUTCDay(); let target = new Date(d); target.setUTCMinutes(0,0,0); if (day >= 1 && day <= 5 && d.getUTCHours() < 12) { target.setUTCHours(12); } else { do { target.setUTCDate(target.getUTCDate() + 1); day = target.getUTCDay(); } while (day === 0 || day === 6); target.setUTCHours(12); } return target; };
  const forexEndToday = (date: Date) => { const t = new Date(date); t.setUTCHours(20,0,0,0); return t; };
  const sessionProgressPercent = (startHourUTC: number, endHourUTC: number, date: Date) => { const start = new Date(date); start.setUTCHours(startHourUTC, 0, 0, 0); const end = new Date(date); end.setUTCHours(endHourUTC, 0, 0, 0); const total = end.getTime() - start.getTime(); const elapsed = date.getTime() - start.getTime(); return Math.min(100, Math.max(0, (elapsed / total) * 100)); };

  if (positionsLoading || ledgerLoading || strategiesLoading) {
    return <div className="text-center text-xl text-primary-light">Loading data...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h2>

      {/* Strategy Filter & Summary */}
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-white">Strategies</h3>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="bg-gray-700 text-gray-200 text-sm px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-dark"
          >
            <option value="all">All strategies</option>
            <option value="trendAtr">trendAtr</option>
            <option value="orb">orb</option>
            <option value="vwapReversion">vwapReversion</option>
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-300">
          <div>
            <p className="text-gray-400">Total Trades</p>
            <p className="font-mono text-xl">{stats.tradeCount}</p>
          </div>
          <div>
            <p className="text-gray-400">Win Rate</p>
            <p className="font-mono text-xl">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-gray-400">Profit Factor</p>
            <p className="font-mono text-xl">{stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : '—'}</p>
          </div>
          <div>
            <p className="text-gray-400">Total P&L</p>
            <p className={`font-mono text-xl ${stats.totalPnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{stats.totalPnl.toFixed(2)}</p>
          </div>
        </div>
        {/* Recent Trades (last 20) */}
        <div className="mt-6">
          <h4 className="text-md font-semibold text-white mb-3">Recent Trades</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-gray-300">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left font-medium px-2 py-1">Time</th>
                  <th className="text-left font-medium px-2 py-1">Symbol</th>
                  <th className="text-left font-medium px-2 py-1">Side</th>
                  <th className="text-left font-medium px-2 py-1">P&L</th>
                  <th className="text-left font-medium px-2 py-1">R</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.length === 0 ? (
                  <tr><td colSpan={5} className="px-2 py-2 text-gray-400">No trades found.</td></tr>
                ) : (
                  recentTrades.map((p, idx) => (
                    <tr key={p.id ?? idx} className="border-t border-gray-700/50">
                      <td className="px-2 py-1 font-mono">{new Date(p.entry_ts ?? p.created_ts ?? 0).toLocaleString()}</td>
                      <td className="px-2 py-1 font-mono">{p.symbol}</td>
                      <td className="px-2 py-1">{p.side}</td>
                      <td className={`px-2 py-1 font-mono ${Number(p.pnl_gbp ?? 0) >= 0 ? 'text-green-300' : 'text-red-300'}`}>{p.pnl_gbp != null ? `£${Number(p.pnl_gbp).toFixed(2)}` : '—'}</td>
                      <td className="px-2 py-1 font-mono">{p.R_multiple != null ? Number(p.R_multiple).toFixed(2) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Performance Snapshot */}
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Performance Snapshot</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-300">
          <div>
            <p className="text-gray-400">Total P&L</p>
            <p className={`font-mono text-xl ${stats.totalPnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{stats.totalPnl.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-400">Win Rate</p>
            <p className="font-mono text-xl">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-gray-400">Average R</p>
            <p className="font-mono text-xl">{stats.avgR.toFixed(2)}R</p>
          </div>
          <div>
            <p className="text-gray-400">Profit Factor</p>
            <p className="font-mono text-xl">{stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : '—'}</p>
          </div>
        </div>
      </div>

      {/* Active Configuration */}
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Active Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">Instruments</p>
            <div className="flex flex-wrap gap-2">
              {SELECTED_INSTRUMENTS.map(m => (
                <span key={m.symbol} className="px-2 py-1 rounded-md bg-gray-700 text-gray-200 text-xs ring-1 ring-white/10">
                  <span className="font-mono">{m.symbol}</span>
                  <span className="ml-1 text-gray-400">— {m.description}</span>
                </span>
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
            <p className="text-sm text-gray-400 mb-2">Account & Sizing</p>
            <div className="space-y-1 text-sm text-gray-300">
              <p>Account balance: £{accountBalance.toFixed(2)}</p>
              <p>Risk % per trade: {(Number(import.meta.env.VITE_AUTOPILOT_RISK_PCT ?? 0.02) * 100).toFixed(1)}%</p>
              <p>Minimum lot size: 0.01</p>
            </div>
          </div>
        </div>
      </div>

      {/* Session Countdown */}
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-lg">
        <div className="grid grid-cols-1 gap-4">
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
        </div>
      </div>

      {/* Scheduler Logs / Skip Reasons */}
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-3">Latest Scheduler Logs</h3>
        <ul className="space-y-1 text-sm text-gray-300">
          {(schedulerActivity?.messages ?? []).slice(-20).map((m, i) => (
            <li key={i} className="font-mono">• {m}</li>
          ))}
          {(!schedulerActivity?.messages || schedulerActivity.messages.length === 0) && (
            <li className="text-gray-400">No recent logs.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;