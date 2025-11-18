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
  const autopilotLabel = AUTOPILOT_ENABLED ? (windowName !== 'none' ? 'ENABLED' : 'DISABLED') : 'DISABLED';

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
    : ['fixed-xau','fixed-nas','london-liquidity-xau','london-continuation-xau'];
  const isEnabled = (id: string) => enabledIds.includes(id.toLowerCase());
  const inForexDay = (d: Date) => { const day = d.getUTCDay(); return day >= 1 && day <= 5; };
  const getNyOpenUtc = (date: Date): Date => {
    const year = date.getUTCFullYear();
    const march = new Date(Date.UTC(year, 2, 1));
    const firstSundayInMarch = 7 - march.getUTCDay();
    const secondSundayInMarch = 1 + firstSundayInMarch + 7;
    const dstStart = new Date(Date.UTC(year, 2, secondSundayInMarch));
    const nov = new Date(Date.UTC(year, 10, 1));
    const firstSundayInNov = 7 - nov.getUTCDay();
    const dstEnd = new Date(Date.UTC(year, 10, 1 + firstSundayInNov));
    const isDst = date >= dstStart && date < dstEnd;
    const openHour = isDst ? 13 : 14;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), openHour, 30, 0, 0));
  };
  const isOpenWindow = (id: string, d: Date) => {
    const inDay = inForexDay(d);
    if (!inDay) return false;
    if (id === 'fixed-xau' || id === 'fixed-nas') {
      const open = getNyOpenUtc(d);
      const orEnd = new Date(open.getTime() + 15 * 60_000);
      const windowEnd = new Date(open.getTime() + 3 * 60 * 60_000);
      return d >= orEnd && d <= windowEnd;
    }
    if (id === 'london-liquidity-xau') {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d)
      const get = (t: string) => parts.find(p => p.type === t)?.value || ''
      const hour = Number(get('hour'))
      const minute = Number(get('minute'))
      const weekday = get('weekday').toLowerCase()
      const isWeekday = weekday.startsWith('mon') || weekday.startsWith('tue') || weekday.startsWith('wed') || weekday.startsWith('thu') || weekday.startsWith('fri')
      const mins = hour * 60 + minute
      return isWeekday && mins >= (6 * 60 + 45) && mins <= (9 * 60)
    }
    if (id === 'london-continuation-xau') {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d)
      const get = (t: string) => parts.find(p => p.type === t)?.value || ''
      const hour = Number(get('hour'))
      const minute = Number(get('minute'))
      const weekday = get('weekday').toLowerCase()
      const isWeekday = weekday.startsWith('mon') || weekday.startsWith('tue') || weekday.startsWith('wed') || weekday.startsWith('thu') || weekday.startsWith('fri')
      const mins = hour * 60 + minute
      return isWeekday && mins >= (8 * 60 + 30) && mins <= (11 * 60)
    }
    return false;
  };
  const nextWindowOpen = (id: string, from: Date) => {
    if (id === 'fixed-xau' || id === 'fixed-nas') {
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i));
        const candidateOpen = getNyOpenUtc(date);
        const orEnd = new Date(candidateOpen.getTime() + 15 * 60_000);
        const dow = orEnd.getUTCDay();
        if (dow >= 1 && dow <= 5 && orEnd > from) return orEnd;
      }
      const daysUntilMonday = (8 - from.getUTCDay()) % 7 || 7;
      const monday = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + daysUntilMonday));
      const open = getNyOpenUtc(monday);
      return new Date(open.getTime() + 15 * 60_000);
    }
    if (id === 'london-liquidity-xau') {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(from)
      const get = (t: string) => parts.find(p => p.type === t)?.value || ''
      const hour = Number(get('hour'))
      const minute = Number(get('minute'))
      const weekday = get('weekday').toLowerCase()
      const isWeekday = weekday.startsWith('mon') || weekday.startsWith('tue') || weekday.startsWith('wed') || weekday.startsWith('thu') || weekday.startsWith('fri')
      const mins = hour * 60 + minute
      const target = 6 * 60 + 45
      if (isWeekday && mins <= target) {
        const deltaMin = target - mins
        return new Date(from.getTime() + deltaMin * 60_000)
      }
      for (let i = 1; i <= 8; i++) {
        const d = new Date(from.getTime() + i * 24 * 60 * 60_000)
        const parts2 = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d)
        const get2 = (t: string) => parts2.find(p => p.type === t)?.value || ''
        const weekday2 = get2('weekday').toLowerCase()
        const isWeekday2 = weekday2.startsWith('mon') || weekday2.startsWith('tue') || weekday2.startsWith('wed') || weekday2.startsWith('thu') || weekday2.startsWith('fri')
        if (!isWeekday2) continue
        return new Date(d.getTime() + (6 * 60 + 45 - (Number(get2('hour')) * 60 + Number(get2('minute')))) * 60_000)
      }
      return new Date(from.getTime() + 24 * 60 * 60_000)
    }
    return new Date(from);
  };

  const botDefs = [
    { id: 'fixed-xau', name: 'Fixed ORB + FVG + LVN (Gold)', match: (p: Position) => {
      const text = ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase();
      return text.includes('fixed-orb-fvg-lvn') && ((p.symbol ?? '').toUpperCase().includes('XAU'));
    } },
    { id: 'fixed-nas', name: 'Fixed ORB + FVG + LVN (NAS100)', match: (p: Position) => {
      const text = ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase();
      return text.includes('fixed-orb-fvg-lvn') && ((p.symbol ?? '').toUpperCase().includes('NAS'));
    } },
    { id: 'london-liquidity-xau', name: 'London Liquidity Sweep (Gold)', match: (p: Position) => {
      const text = ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase();
      return text.includes('london-liquidity-xau') && ((p.symbol ?? '').toUpperCase().includes('XAU'));
    } },
    { id: 'london-continuation-xau', name: 'London Continuation (Gold)', match: (p: Position) => {
      const text = ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase();
      return text.includes('london-continuation-xau') && ((p.symbol ?? '').toUpperCase().includes('XAU'));
    } },
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
        <h3 className="text-xl sm:text-2xl font-semibold text-white mb-4">Account Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-10">
              {/* Row 1: Account Balance (left) | Total P&L (right) */}
              <div>
                <p className="text-[11px] tracking-wide text-text-secondary mb-1">Account Balance</p>
                <p className="text-3xl font-semibold text-white font-mono whitespace-nowrap tracking-tight leading-tight">£{accountBalance.toFixed(2)}</p>
              </div>
              <div className="text-right sm:text-left">
                <p className="text-[11px] tracking-wide text-text-secondary mb-1">Total P&L</p>
                <p className={`text-3xl font-semibold font-mono whitespace-nowrap tracking-tight leading-tight ${latestCashAfter >= 0 ? 'text-accent-green' : 'text-red-300'}`}>£{latestCashAfter.toFixed(2)}</p>
                <p className="text-xs text-gray-500">All-time realized</p>
              </div>

              {/* Row 2: Win Rate (left) | Wins/Losses (right) */}
              <div>
                <p className="text-[11px] tracking-wide text-text-secondary mb-1">Win Rate</p>
                <p className="text-3xl font-semibold text-white font-mono whitespace-nowrap tracking-tight leading-tight">{winLoss.winRate.toFixed(1)}%</p>
              </div>
              <div className="text-right sm:text-left">
                <p className="text-[11px] tracking-wide text-text-secondary mb-1">Wins / Losses</p>
                <p className="text-3xl font-semibold font-mono whitespace-nowrap tracking-tight leading-tight">
                  <span className="text-accent-green">{winLoss.wins}</span>
                  <span className="text-gray-400"> / </span>
                  <span className="text-red-300">{winLoss.losses}</span>
                </p>
              </div>
            </div>
      </div>

      {/* Bots Overview (Main Focus) moved to top */}
      <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Bots Overview</h3>
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, botMetrics.length)}, minmax(0, 1fr))` }}>
          {botMetrics.map(b => (
            <button key={b.id} onClick={() => setSelectedBot(b.id)} className="text-left">
              <div className="card-premium p-4 rounded-lg shadow-lg transition">
                <div className="section-head flex items-center justify-between p-2 rounded">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.indicator==='green'?'bg-[var(--accent)]':b.indicator==='red'?'bg-red-400':'bg-gray-400'}`} />
                    <h4 className="text-sm font-medium text-gray-200">{b.name}</h4>
                  </div>
                  <span className="text-[11px] text-text-secondary">{b.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-300">
                  <div>
                    <p className="text-[11px] tracking-wide text-text-secondary">Trades today</p>
                    <p className="font-mono">{b.tradesToday} / {b.cap} cap</p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-wide text-text-secondary">Win Rate</p>
                    <p className="font-mono">{b.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-wide text-text-secondary">Risk-Reward</p>
                    <p className="font-mono">{b.avgR.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-wide text-text-secondary">P&L</p>
                    <p className={`font-mono ${b.pnl >= 0 ? 'text-accent-green' : 'text-red-300'}`}>£{b.pnl.toFixed(2)}</p>
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
        <div className="text-xs text-accent-green mb-3">+£{(stats.totalPnl).toFixed(2)}</div>
          <div className="chart-gloss h-[260px] sm:h-[320px] lg:h-[380px]">
            <PortfolioLineChart ledger={ledger ?? []} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
          <span className={`font-mono ${((t.pnl_gbp ?? 0) >= 0) ? 'text-accent-green' : 'text-red-300'}`}>£{(t.pnl_gbp ?? 0).toFixed(2)}</span>
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