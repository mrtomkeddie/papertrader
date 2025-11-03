import React, { useMemo, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Strategy, LedgerEntry } from '../types';
import SummaryBar, { TimeRange } from './SummaryBar';
import BotCard from './BotCard';
import TradesTable from './TradesTable';
import LogsPanel from './LogsPanel';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';

export default function DashboardBase({ title, strategyFilter }: {
  title: string;
  strategyFilter?: string[];
}) {
  const { data: positions, loading: positionsLoading } = useDatabase<Position[]>('positions');
  const { data: ledger, loading: ledgerLoading } = useDatabase<LedgerEntry[]>('ledger');
  const { data: strategies, loading: strategiesLoading } = useDatabase<Strategy[]>('strategies');
  const { data: schedulerActivity } = useDatabase<any>('scheduler', 'activity');

  const [params, setParams] = useSearchParams();
  const initialRange = (params.get('range') as TimeRange) || 'today';
  const [range, setRangeState] = React.useState<TimeRange>(initialRange);
  useEffect(() => { setParams(prev => { const p = new URLSearchParams(prev); p.set('range', range); return p; }); }, [range]);

  const setRange = (r: TimeRange) => setRangeState(r);

  const enabledIds = useMemo(() => {
    const enabledStr = ((import.meta.env as any).VITE_AUTOPILOT_ENABLED_STR || (import.meta.env as any).AUTOPILOT_ENABLED_STR || '') as string;
    return enabledStr
      ? enabledStr.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
      : ['orb','trendatr','vwapreversion'];
  }, []);
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

  const now = new Date();
  const startOfToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const startOfWeek = useMemo(() => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const res = new Date(d.setDate(diff)); res.setHours(0,0,0,0); return res; }, []);
  const inRange = (ts?: string | null) => {
    if (!ts) return false;
    const t = new Date(ts);
    if (range === 'today') return t >= startOfToday;
    if (range === 'week') return t >= startOfWeek;
    return true;
  };

  const filterTokens: string[] | undefined = strategyFilter?.map(s => s.toLowerCase());
  const tokenSynonyms: Record<string, string[]> = {
    'trendatr_xau': ['trendatr', 'trend', 'xau', 'xauusd', 'oanda:xauusd', 'gold'],
    'trendatr_nas': ['trendatr', 'trend', 'nas', 'nas100', 'us100', 'nas100_usd', 'oanda:nas100_usd'],
  };
  const expandedTokens = useMemo(() => {
    if (!filterTokens) return undefined;
    const out: string[] = [];
    for (const t of filterTokens) { out.push(t); (tokenSynonyms[t] || []).forEach(s => out.push(s)); }
    return out.map(s => s.toLowerCase());
  }, [strategyFilter]);

  const matchesFilter = (p: Position): boolean => {
    if (!expandedTokens) return true;
    const text = `${p.strategy_id ?? ''} ${p.method_name ?? ''} ${p.symbol ?? ''}`.toLowerCase();
    return expandedTokens.some(t => text.includes(t));
  };

  const filteredPositions = useMemo(() => (positions ?? []).filter(matchesFilter), [positions, expandedTokens]);

  // Summary metrics
  const tradesToday = useMemo(() => filteredPositions.filter(p => inRange(p.entry_ts ?? p.ts)).length, [filteredPositions, range]);
  const closedInRange = useMemo(() => filteredPositions.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null && inRange(p.exit_ts ?? p.ts)), [filteredPositions, range]);
  const totalPnl = useMemo(() => closedInRange.reduce((a, p) => a + (p.pnl_gbp ?? 0), 0), [closedInRange]);
  const winCount = useMemo(() => closedInRange.filter(p => (p.pnl_gbp ?? 0) > 0).length, [closedInRange]);
  const winRate = useMemo(() => closedInRange.length ? (winCount / closedInRange.length) * 100 : 0, [closedInRange, winCount]);
  const avgR = useMemo(() => closedInRange.length ? closedInRange.reduce((a, p) => a + (p.R_multiple ?? 0), 0) / closedInRange.length : 0, [closedInRange]);
  const profitFactor = useMemo(() => {
    const gain = closedInRange.filter(p => (p.pnl_gbp ?? 0) > 0).reduce((a,p) => a + (p.pnl_gbp ?? 0), 0);
    const loss = closedInRange.filter(p => (p.pnl_gbp ?? 0) < 0).reduce((a,p) => a + Math.abs(p.pnl_gbp ?? 0), 0);
    return loss > 0 ? gain / loss : 0;
  }, [closedInRange]);

  // Bot metrics (re-usable)
  const botDefs = [
    { id: 'orb', name: 'ORB', match: (p: Position) => ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('orb') },
    { id: 'trendatr', name: 'Trend Pullback', match: (p: Position) => ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('trend') },
    { id: 'vwapreversion', name: 'VWAP Reversion', match: (p: Position) => ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('vwap') },
  ];
  const MAX_TRADES_CAP = Number((import.meta.env as any).VITE_AUTOPILOT_MAX_TRADES_PER_SESSION ?? (import.meta.env as any).AUTOPILOT_MAX_TRADES_PER_SESSION ?? 5);
  const botMetrics = useMemo(() => {
    const list = filteredPositions;
    const defs = strategyFilter ? botDefs.filter(d => d.id === 'trendatr') : botDefs;
    return defs.map(def => {
      const forBot = list.filter(def.match);
      const closedR = forBot.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null && inRange(p.exit_ts ?? p.ts));
      const tradesTodayBot = forBot.filter(p => inRange(p.entry_ts ?? p.ts)).length;
      const winCountBot = closedR.filter(p => (p.pnl_gbp ?? 0) > 0).length;
      const totalPnlBot = closedR.reduce((a, p) => a + (p.pnl_gbp ?? 0), 0);
      const avgRBot = closedR.length ? closedR.reduce((a, p) => a + (p.R_multiple ?? 0), 0) / closedR.length : 0;
      const winRateBot = closedR.length ? (winCountBot / closedR.length) * 100 : 0;
      const open = isOpenWindow(def.id, now);
      const enabled = isEnabled(def.id);
      const status: 'Active' | 'Closed' | 'Disabled' = !enabled ? 'Disabled' : (open ? 'Active' : 'Closed');
      const indicator = !enabled ? 'red' : (open ? 'green' : 'gray');
      return { id: def.id, name: def.name, tradesToday: tradesTodayBot, cap: MAX_TRADES_CAP, winRate: winRateBot, avgR: avgRBot, pnl: totalPnlBot, status, indicator };
    });
  }, [filteredPositions, range]);

  // Logs: filter messages by symbol tokens when strategyFilter provided
  const logs = useMemo(() => {
    const messages: string[] = (schedulerActivity?.messages ?? []);
    if (!expandedTokens) return messages.slice(-20);
    const lower = expandedTokens;
    return messages.filter(m => {
      const mm = m.toLowerCase();
      return lower.some(t => mm.includes(t));
    }).slice(-20);
  }, [schedulerActivity, expandedTokens]);

  const AUTOPILOT_ENABLED = (import.meta.env.VITE_AUTOPILOT_ENABLED === '1' || import.meta.env.VITE_AUTOPILOT_ENABLED === 'true');
  const windowName = schedulerActivity?.window ?? 'none';
  const autopilotLabel = AUTOPILOT_ENABLED ? (windowName !== 'none' ? `Enabled (${windowName})` : 'Disabled') : 'Disabled';

  const location = useLocation();

  if (positionsLoading || ledgerLoading || strategiesLoading) {
    return <div className="text-center text-xl text-primary-light">Loading data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">{title === 'Overview' ? 'Dashboard' : `Dashboard — ${title}`}</h2>
          <div className="mt-3 flex gap-2 text-sm">
            <NavLink to="/dashboard/overview" className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-primary/20 text-white ring-1 ring-primary/30' : 'bg-white/10 text-gray-300 hover:text-white'}`}>Overview</NavLink>
            <NavLink to="/dashboard/gold" className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-primary/20 text-white ring-1 ring-primary/30' : 'bg-white/10 text-gray-300 hover:text-white'}`}>Gold</NavLink>
            <NavLink to="/dashboard/nas100" className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-primary/20 text-white ring-1 ring-primary/30' : 'bg-white/10 text-gray-300 hover:text-white'}`}>NAS100</NavLink>
          </div>
        </div>
      </div>

      {/* Summary */}
      <SummaryBar tradesToday={tradesToday} totalPnl={totalPnl} winRate={winRate} profitFactor={profitFactor} avgR={avgR} windowStatus={autopilotLabel} range={range} onRangeChange={setRange} ledger={ledger ?? []} />

      {/* Bot Cards */}
      <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4">{strategyFilter ? 'Bot (Filtered)' : 'Bots Overview'}</h3>
        <div className={`grid grid-cols-1 ${strategyFilter ? 'md:grid-cols-1' : 'md:grid-cols-3'} gap-4`}>
          {botMetrics.map(b => (
            <BotCard key={b.id} {...b} />
          ))}
        </div>
      </div>

      {/* Recent Trades */}
      <TradesTable positions={closedInRange} />

      {/* Logs */}
      <LogsPanel logs={logs} />
    </div>
  );
}