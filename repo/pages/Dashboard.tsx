// Top-level imports
import React, { useMemo, useState, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Strategy, LedgerEntry } from '../types';
import { SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { SchedulerActivity } from '../types';
// RecentTradesCard removed from dashboard per request
import EquitySparkline from '../components/EquitySparkline';
import PortfolioLineChart from '../components/PortfolioLineChart';

// Clean Dashboard: Performance Snapshot, Active Configuration, Session Countdown
const Dashboard: React.FC = () => {
  const { data: positions, loading: positionsLoading } = useDatabase<Position[]>('positions');
  const { data: ledger, loading: ledgerLoading } = useDatabase<LedgerEntry[]>('ledger');
  const { data: strategies, loading: strategiesLoading } = useDatabase<Strategy[]>('strategies');
  const { data: schedulerActivity } = useDatabase<SchedulerActivity>('scheduler', 'activity');

  // Autopilot flags (Vite env)
  const AUTOPILOT_ENABLED = (import.meta.env.VITE_AUTOPILOT_ENABLED === '1' || import.meta.env.VITE_AUTOPILOT_ENABLED === 'true');
  const AUTOPILOT_RISK_PCT = Number((import.meta.env as any).VITE_AUTOPILOT_RISK_PCT ?? (import.meta.env as any).AUTOPILOT_RISK_PCT ?? 0.02);
  const windowName = schedulerActivity?.window ?? 'none';
  const autopilotActive = AUTOPILOT_ENABLED && windowName !== 'none';
  const autopilotLabel = AUTOPILOT_ENABLED ? (windowName !== 'none' ? `Enabled (${windowName})` : 'Disabled') : 'Disabled';

  const enabledStrategies = useMemo(() => strategies ? strategies.filter(s => s.enabled) : [], [strategies]);

  // Range filter for metrics
  const [range, setRange] = useState<'today' | 'week' | 'all'>('today');
  const startOfToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const startOfWeek = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); const day = d.getDay(); const diff = (day + 6) % 7; d.setDate(d.getDate() - diff); return d; }, []);
  const inRange = (ts?: string | number | Date) => {
    if (!ts) return false;
    const t = new Date(ts);
    if (range === 'today') return t >= startOfToday;
    if (range === 'week') return t >= startOfWeek;
    return true;
  };

  // Session countdown state
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Stats (range-based)
  const stats = useMemo(() => {
    if (positionsLoading || ledgerLoading || !positions || !ledger) {
      return { totalPnl: 0, winRate: 0, avgR: 0, tradeCount: 0, maxDrawdown: 0, profitFactor: 0, tradesToday: 0 };
    }
    const closedAll = positions.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null);
    const closedInRange = closedAll.filter(p => inRange(p.exit_ts ?? p.ts));
    const totalPnl = closedInRange.reduce((acc, p) => acc + (p.pnl_gbp ?? 0), 0);
    const tradeCount = closedInRange.length;
    const winningTrades = closedInRange.filter(p => (p.pnl_gbp ?? 0) > 0).length;
    const winRate = tradeCount > 0 ? (winningTrades / tradeCount) * 100 : 0;
    const totalR = closedInRange.reduce((acc, p) => acc + (p.R_multiple || 0), 0);
    const avgR = tradeCount > 0 ? totalR / tradeCount : 0;

    const winsSum = closedInRange.filter(p => (p.pnl_gbp ?? 0) > 0).reduce((a, p) => a + (p.pnl_gbp ?? 0), 0);
    const lossesAbs = closedInRange.filter(p => (p.pnl_gbp ?? 0) < 0).reduce((a, p) => a + Math.abs(p.pnl_gbp ?? 0), 0);
    const profitFactor = lossesAbs > 0 ? winsSum / lossesAbs : 0;

    let peak = 0; let maxDrawdown = 0;
    ledger.forEach(entry => { peak = Math.max(peak, entry.cash_after); const dd = peak - entry.cash_after; if (dd > maxDrawdown) maxDrawdown = dd; });

    const tradesToday = (positions ?? []).filter(p => inRange(p.entry_ts ?? p.ts)).length;
    return { totalPnl, winRate, avgR, tradeCount, maxDrawdown, profitFactor, tradesToday };
  }, [positions, ledger, positionsLoading, ledgerLoading, range]);

  // Dynamic account balance: base account + latest realized cash from ledger
  const baseAccountGbp = Number(import.meta.env.VITE_AUTOPILOT_ACCOUNT_GBP ?? 250);
  const latestCashAfter = useMemo(() => {
    if (ledgerLoading || !ledger || ledger.length === 0) return 0;
    // ledger loaded ascending by ts in useDatabase initial fetch; safeguard with sort
    const sorted = [...ledger].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return sorted[sorted.length - 1].cash_after || 0;
  }, [ledger, ledgerLoading]);
  const accountBalance = useMemo(() => baseAccountGbp + latestCashAfter, [baseAccountGbp, latestCashAfter]);

  // Win/Loss metrics (all-time)
  const winLoss = useMemo(() => {
    if (positionsLoading || !positions) return { wins: 0, losses: 0, winRate: 0 };
    const closedAll = positions.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null);
    const wins = closedAll.filter(p => (p.pnl_gbp ?? 0) > 0).length;
    const losses = closedAll.filter(p => (p.pnl_gbp ?? 0) < 0).length;
    const winRate = closedAll.length ? (wins / closedAll.length) * 100 : 0;
    return { wins, losses, winRate };
  }, [positions, positionsLoading]);

  // Helpers for session countdowns
  const formatUtcHourToLocal = (hour: number) => { const d = new Date(); d.setUTCHours(hour, 0, 0, 0); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const formatDuration = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };
  const isForexHours = (date: Date) => { const day = date.getUTCDay(); const hour = date.getUTCHours(); return day >= 1 && day <= 5 && hour >= 12 && hour < 20; };
  const nextForexStart = (date: Date) => { const d = new Date(date); let day = d.getUTCDay(); let target = new Date(d); target.setUTCMinutes(0,0,0); if (day >= 1 && day <= 5 && d.getUTCHours() < 12) { target.setUTCHours(12); } else { do { target.setUTCDate(target.getUTCDate() + 1); day = target.getUTCDay(); } while (day === 0 || day === 6); target.setUTCHours(12); } return target; };
  const forexEndToday = (date: Date) => { const t = new Date(date); t.setUTCHours(20,0,0,0); return t; };
  const sessionProgressPercent = (startHourUTC: number, endHourUTC: number, date: Date) => { const start = new Date(date); start.setUTCHours(startHourUTC, 0, 0, 0); const end = new Date(date); end.setUTCHours(endHourUTC, 0, 0, 0); const total = end.getTime() - start.getTime(); const elapsed = date.getTime() - start.getTime(); return Math.min(100, Math.max(0, (elapsed / total) * 100)); };

  // Bot enablement and window helpers
  const enabledStr = ((import.meta.env.VITE_ENABLED_BOTS as string)
    || (import.meta.env.VITE_AUTOPILOT_ENABLED_BOTS as string)
    || (import.meta.env as any).AUTOPILOT_ENABLED_BOTS
    || '') as string;
  const enabledIds = enabledStr
    ? enabledStr.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    : ['orb','trendatr','vwapreversion'];
  const isEnabled = (id: string) => enabledIds.includes(id.toLowerCase());
  const inForexDay = (d: Date) => { const day = d.getUTCDay(); return day >= 1 && day <= 5; };
  const isOpenWindow = (id: string, d: Date) => {
    const hour = d.getUTCHours(); const min = d.getUTCMinutes(); const inDay = inForexDay(d);
    if (!inDay) return false;
    if (id === 'orb') return (hour > 12 || (hour === 12 && min >= 15)) && hour < 20;
    if (id === 'trendatr') return hour >= 12 && hour < 20;
    if (id === 'vwapreversion') return hour >= 14 && hour < 17;
    return false;
  };
  const nextWindowOpen = (id: string, from: Date) => {
    const t = new Date(from);
    const advanceToWeekday = (x: Date) => { let y = new Date(x); let day = y.getUTCDay(); while (day === 0 || day === 6) { y.setUTCDate(y.getUTCDate() + 1); day = y.getUTCDay(); } return y; };
    let target = advanceToWeekday(t);
    if (id === 'orb') { const d = new Date(target); d.setUTCHours(12,15,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    if (id === 'trendatr') { const d = new Date(target); d.setUTCHours(12,0,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    if (id === 'vwapreversion') { const d = new Date(target); d.setUTCHours(14,0,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    return target;
  };

  const botDefs = [
    { id: 'orb', name: 'ORB', match: (p: Position) => ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('orb') },
    { id: 'trendatr', name: 'Trend Pullback', match: (p: Position) => ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('trend') },
    { id: 'vwapreversion', name: 'VWAP Reversion', match: (p: Position) => ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('vwap') },
  ];
  const MAX_TRADES_CAP = Number((import.meta.env as any).VITE_AUTOPILOT_MAX_TRADES_PER_SESSION ?? (import.meta.env as any).AUTOPILOT_MAX_TRADES_PER_SESSION ?? 5);
  const botMetrics = useMemo(() => {
    const list = (positions ?? []);
    return botDefs.map(def => {
      const forBot = list.filter(def.match);
      const closedInRange = forBot.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null && inRange(p.exit_ts ?? p.ts));
      const tradesToday = forBot.filter(p => inRange(p.entry_ts ?? p.ts)).length;
      const winCount = closedInRange.filter(p => (p.pnl_gbp ?? 0) > 0).length;
      const totalPnl = closedInRange.reduce((a, p) => a + (p.pnl_gbp ?? 0), 0);
      const avgR = closedInRange.length ? closedInRange.reduce((a, p) => a + (p.R_multiple ?? 0), 0) / closedInRange.length : 0;
      const winRate = closedInRange.length ? (winCount / closedInRange.length) * 100 : 0;
      const open = isOpenWindow(def.id, now);
      const enabled = isEnabled(def.id);
      const status: 'Active' | 'Closed' | 'Disabled' = !enabled ? 'Disabled' : (open ? 'Active' : 'Closed');
      const indicator = !enabled ? 'red' : (open ? 'green' : 'gray');
      return { id: def.id, name: def.name, tradesToday, cap: MAX_TRADES_CAP, winRate, avgR, pnl: totalPnl, status, indicator };
    });
  }, [positions, range, now]);

  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const closeModal = () => setSelectedBot(null);
  const modalData = useMemo(() => {
    if (!selectedBot) return null;
    const def = botDefs.find(b => b.id === selectedBot);
    if (!def) return null;
    const forBot = (positions ?? []).filter(def.match);
    const recentClosed = forBot
      .filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null)
      .sort((a, b) => new Date(b.exit_ts ?? b.ts).getTime() - new Date(a.exit_ts ?? a.ts).getTime())
      .slice(0, 5);
    const logs = (schedulerActivity?.messages ?? [])
      .filter(m => m.toLowerCase().includes(selectedBot))
      .slice(-5);
    const nextOpen = nextWindowOpen(selectedBot, now);
    return { name: def.name, trades: recentClosed, logs, nextOpen };
  }, [selectedBot, positions, schedulerActivity, now]);

  if (positionsLoading || ledgerLoading || strategiesLoading) {
    return <div className="text-center text-xl text-primary-light">Loading data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h2>
        </div>
        {/* Search removed per request */}
      </div>

      {/* Account Summary */}
      <div className="card-premium p-4 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Account Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              {/* Row 1: Account Balance (left) | Total P&L (right) */}
              <div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1">Account Balance</p>
                <p className="text-xl sm:text-3xl font-semibold text-white font-mono whitespace-nowrap tracking-tight leading-tight">£{accountBalance.toFixed(2)}</p>
                <p className="text-[11px] sm:text-xs text-gray-500">Base £{baseAccountGbp.toFixed(0)}</p>
              </div>
              <div className="text-right sm:text-left">
                <p className="text-xs sm:text-sm text-gray-400 mb-1">Total P&L</p>
                <p className={`text-xl sm:text-3xl font-semibold font-mono whitespace-nowrap tracking-tight leading-tight ${latestCashAfter >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{latestCashAfter.toFixed(2)}</p>
                <p className="text-[11px] sm:text-xs text-gray-500">All-time realized</p>
              </div>

              {/* Row 2: Win Rate (left) | Wins/Losses (right) */}
              <div>
                <p className="text-xs sm:text-sm text-gray-400 mb-1">Win Rate</p>
                <p className="text-xl sm:text-3xl font-semibold text-white font-mono whitespace-nowrap tracking-tight leading-tight">{winLoss.winRate.toFixed(1)}%</p>
              </div>
              <div className="text-right sm:text-left">
                <p className="text-xs sm:text-sm text-gray-400 mb-1">Wins / Losses</p>
                <p className="text-xl sm:text-3xl font-semibold font-mono whitespace-nowrap tracking-tight leading-tight">
                  <span className="text-green-300">{winLoss.wins}</span>
                  <span className="text-gray-400"> / </span>
                  <span className="text-red-300">{winLoss.losses}</span>
                </p>
              </div>
            </div>
      </div>

      {/* Bots Overview (Main Focus) moved to top */}
      <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Bots Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {botMetrics.map(b => (
            <button key={b.id} onClick={() => setSelectedBot(b.id)} className="text-left">
              <div className="card-premium p-4 rounded-lg shadow-lg hover:bg-[rgba(24,24,24,0.75)] hover:ring-1 hover:ring-white/10 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.indicator==='green'?'bg-green-400':b.indicator==='red'?'bg-red-400':'bg-gray-400'}`} />
                    <h4 className="text-base font-semibold text-white">{b.name}</h4>
                  </div>
                  <span className="text-xs text-gray-400">{b.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-300">
                  <div>
                    <p className="text-gray-400">Trades today</p>
                    <p className="font-mono">{b.tradesToday} / {b.cap} cap</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Win Rate</p>
                    <p className="font-mono">{b.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Risk-Reward</p>
                    <p className="font-mono">{b.avgR.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">P&L</p>
                    <p className={`font-mono ${b.pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{b.pnl.toFixed(2)}</p>
                  </div>
                </div>
                {(() => {
                  const endHour = (id: string) => id==='orb'?20:id==='trendatr'?20:id==='vwapreversion'?17:20;
                  const startHour = (id: string) => id==='orb'?12:id==='trendatr'?12:id==='vwapreversion'?14:12;
                  const end = new Date(now); end.setUTCHours(endHour(b.id),0,0,0);
                  const remaining = Math.max(0, end.getTime() - now.getTime());
                  const fmt = (ms: number) => { const s = Math.floor(ms/1000); const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };
                  const pct = sessionProgressPercent(startHour(b.id), endHour(b.id), now);
                  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{b.status === 'Active' ? `Ends in ${fmt(remaining)}` : `Opens ${formatUtcHourToLocal(startHour(b.id))}`}</span>
                        <span className="text-gray-500">{Math.round(pct)}%</span>
                      </div>
                      <div className="mt-2 h-2 progress-track">
                        <div className="h-2 progress-animated" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Combined – Portfolio Value line chart */}
      <div className="grid grid-cols-1 gap-6">
        <div className="card-premium p-5">
          <h3 className="text-lg font-semibold text-white mb-2">Portfolio Value</h3>
          <div className="text-xs text-green-300 mb-3">+£{(stats.totalPnl).toFixed(2)}</div>
          <div className="h-[260px] sm:h-[320px] lg:h-[380px]">
            <PortfolioLineChart ledger={ledger ?? []} />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setRange('today')} className={`px-3 py-1 rounded text-xs ${range==='today'?'pill-active':'bg-[rgba(24,24,24,0.9)] text-gray-300 ring-1 ring-white/10'}`}>Today</button>
            <button onClick={() => setRange('week')} className={`px-3 py-1 rounded text-xs ${range==='week'?'pill-active':'bg-[rgba(24,24,24,0.9)] text-gray-300 ring-1 ring-white/10'}`}>This Week</button>
            <button onClick={() => setRange('all')} className={`px-3 py-1 rounded text-xs ${range==='all'?'pill-active':'bg-[rgba(24,24,24,0.9)] text-gray-300 ring-1 ring-white/10'}`}>All Time</button>
          </div>
        </div>
      </div>


      {/* Performance Snapshot removed to streamline summary */}

      {/* Bots Overview moved above; section removed here */}

      {/* Bot detail modal */}
      {modalData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-premium w-full max-w-md p-4 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-lg font-semibold text-white">{modalData.name}</h4>
              <button onClick={closeModal} className="text-xs px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600">Close</button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Last 5 trades</p>
                <ul className="space-y-1 text-sm text-gray-300">
                  {modalData.trades.length === 0 && <li className="text-gray-400">No recent trades.</li>}
                  {modalData.trades.map(t => (
                    <li key={t.id || `${t.symbol}-${t.ts}`} className="flex justify-between">
                      <span className="font-mono">{t.symbol}</span>
                      <span className="text-xs text-gray-400">{new Date(t.exit_ts ?? t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={`font-mono ${((t.pnl_gbp ?? 0) >= 0) ? 'text-green-300' : 'text-red-300'}`}>£{(t.pnl_gbp ?? 0).toFixed(2)}</span>
                      <span className="font-mono">R {((t.R_multiple ?? 0)).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Latest skip reasons</p>
                <ul className="space-y-1 text-sm text-gray-300">
                  {modalData.logs.length === 0 && <li className="text-gray-400">No recent skip reasons.</li>}
                  {modalData.logs.map((m, idx) => (
                    <li key={idx} className="font-mono">• {m}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Next window open</p>
                <p className="text-sm text-gray-300">{modalData.nextOpen.toLocaleString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Section removed per request */}

      {/* Forex Session card removed — countdown now appears on each bot card */}
    </div>
  );
};

export default Dashboard;