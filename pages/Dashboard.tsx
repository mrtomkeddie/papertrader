// Top-level imports
import React, { useMemo, useState, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Strategy, LedgerEntry } from '../types';
import { SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { SchedulerActivity } from '../types';
import RecentTradesCard from '../components/RecentTradesCard';
import EquitySparkline from '../components/EquitySparkline';

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
      <h2 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h2>

      {/* Autopilot Status */}
      <div className="card-premium p-4 sm:p-5 rounded-lg shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-white">Autopilot</h3>
            <p className="text-[11px] tracking-wide text-gray-400">Status: <span className={`font-mono ${autopilotActive ? 'text-accent' : 'text-gray-300'}`}>{autopilotLabel}</span></p>
          </div>
          <div className="text-[11px] tracking-wide text-gray-400">
            <p>Risk per trade: {AUTOPILOT_RISK_PCT.toFixed(2)}/trade</p>
          </div>
        </div>
      </div>
      {/* Overview Bar */}
      <div className="card-premium p-4 sm:p-5 rounded-lg shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${autopilotActive ? 'bg-accent/20 text-accent' : 'bg-red-700/40 text-red-300'}`}>
              Autopilot {autopilotActive ? 'Enabled' : 'Disabled'}
            </span>
            <div className="text-[11px] tracking-wide text-gray-400">Risk per trade: {AUTOPILOT_RISK_PCT.toFixed(2)}/trade</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRange('today')} className={`px-3 py-1 rounded text-xs ${range==='today'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>Today</button>
            <button onClick={() => setRange('week')} className={`px-3 py-1 rounded text-xs ${range==='week'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>This Week</button>
            <button onClick={() => setRange('all')} className={`px-3 py-1 rounded text-xs ${range==='all'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>All Time</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-gray-300">
          <div>
            <p className="text-[11px] tracking-wide text-gray-400">Trades Today</p>
            <p className="font-mono text-3xl font-semibold">{stats.tradesToday}</p>
          </div>
          <div>
            <p className="text-[11px] tracking-wide text-gray-400">Total P&L</p>
            <p className={`font-mono text-3xl font-semibold ${stats.totalPnl >= 0 ? 'text-accent' : 'text-red-300'}`}>£{stats.totalPnl.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[11px] tracking-wide text-gray-400">Win Rate</p>
            <p className="font-mono text-3xl font-semibold">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[11px] tracking-wide text-gray-400">Profit Factor</p>
            <p className="font-mono text-3xl font-semibold">{stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] tracking-wide text-gray-400">Risk-Reward (avg)</p>
            <p className="font-mono text-3xl font-semibold">{stats.avgR.toFixed(2)}</p>
          </div>
        </div>
        <div className="mt-4">
          <EquitySparkline ledger={ledger ?? []} range={range} />
        </div>
      </div>


      {/* Performance Snapshot removed to streamline summary */}

      {/* Bots Overview (Main Focus) */}
      <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Bots Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {botMetrics.map(b => (
            <button key={b.id} onClick={() => setSelectedBot(b.id)} className="text-left">
              <div className="card-premium p-4 rounded-lg shadow-lg hover:bg-gray-800/50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.indicator==='green'?'bg-accent':b.indicator==='red'?'bg-red-400':'bg-gray-400'}`} />
                    <h4 className="text-sm font-medium text-gray-200">{b.name}</h4>
                  </div>
                  <span className="text-xs text-gray-400">{b.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-300">
                  <div>
                    <p className="text-[11px] tracking-wide text-gray-400">Trades today</p>
                    <p className="font-mono">{b.tradesToday} / {b.cap} cap</p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-wide text-gray-400">Win Rate</p>
                    <p className="font-mono">{b.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-wide text-gray-400">Risk-Reward</p>
                    <p className="font-mono">{b.avgR.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-wide text-gray-400">P&L</p>
                    <p className={`font-mono text-3xl font-semibold ${b.pnl >= 0 ? 'text-accent' : 'text-red-300'}`}>£{b.pnl.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

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
                      <span className={`font-mono ${((t.pnl_gbp ?? 0) >= 0) ? 'text-accent' : 'text-red-300'}`}>£{(t.pnl_gbp ?? 0).toFixed(2)}</span>
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

      {/* Bottom Section – Scheduler + Trades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scheduler Logs */}
        <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold text-white mb-3">Scheduler Logs</h3>
          <ul className="space-y-1 text-sm text-gray-300">
            {(schedulerActivity?.messages ?? []).slice(-10).map((m, i) => (
              <li key={i} className="font-mono">• {m}</li>
            ))}
            {(!schedulerActivity?.messages || schedulerActivity.messages.length === 0) && (
              <li className="text-gray-400">No recent logs.</li>
            )}
          </ul>
        </div>
        {/* Recent Trades – sortable, last 10 */}
        <RecentTradesCard positions={positions ?? []} />
      </div>

      {/* Forex Session (compact card) */}
      <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
        <div className="bg-gray-900/50 p-3 sm:p-4 rounded-lg">
          <h4 className="font-bold text-white mb-2">Forex Session</h4>
          <p className="text-sm text-gray-400">Open window: {formatUtcHourToLocal(12)} - {formatUtcHourToLocal(20)} (Mon-Fri)</p>
          {isForexHours(now) ? (
            <>
              <p className="text-accent mt-2">Trading • Closes in {formatDuration(forexEndToday(now).getTime() - now.getTime())}</p>
              <div className="mt-2 h-2 bg-gray-700 rounded">
                <div className="h-2 bg-primary-dark rounded" style={{ width: `${sessionProgressPercent(12,20,now)}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-300 mt-2">Next opens in {formatDuration(nextForexStart(now).getTime() - now.getTime())}</p>
              <div className="mt-2 h-2 bg-gray-700 rounded">
                <div className="h-2 bg-gray-500 rounded" style={{ width: `0%` }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;