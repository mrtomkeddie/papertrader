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
      : ['trendatr_xau','trendatr_nas'];
  }, []);
  const isEnabled = (id: string) => enabledIds.includes(id.toLowerCase());

  const inForexDay = (d: Date) => { const day = d.getUTCDay(); return day >= 1 && day <= 5; };
  const isOpenWindow = (id: string, d: Date) => {
    const hour = d.getUTCHours(); const min = d.getUTCMinutes(); const inDay = inForexDay(d);
    if (!inDay) return false;
    if (id === 'trendatr_xau') return hour >= 12 && hour < 20; // 12:00–20:00 UTC
    if (id === 'trendatr_nas') return ((hour > 14) || (hour === 14 && min >= 30)) && hour < 20; // 14:30–20:00 UTC
    if (id === 'orb') return (hour >= 12 && hour < 20) && (hour > 12 || (hour === 12 && min >= 15)); // 12:15–20:00 UTC
    if (id === 'vwapReversion') return hour >= 14 && hour < 17; // 14:00–17:00 UTC
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
  const instrument: 'gold' | 'nas' | null = title.toLowerCase() === 'gold' ? 'gold' : (title.toLowerCase() === 'nas100' ? 'nas' : null);
  const symbolMatch = (p: Position) => {
    const sym = (p.symbol ?? '').toLowerCase();
    if (instrument === 'gold') return sym.includes('xauusd') || sym.includes('xau_usd');
    if (instrument === 'nas') return sym.includes('nas100');
    return true;
  };

  const matchesFilter = (p: Position): boolean => {
    if (!filterTokens) return true;
    const id = (p.strategy_id ?? '').toLowerCase();
    return filterTokens.includes(id);
  };

  const filteredPositions = useMemo(() => (positions ?? []).filter(p => matchesFilter(p) && symbolMatch(p)), [positions, filterTokens, instrument]);

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
  const botDefs = useMemo(() => {
    if (title === 'Overview') {
      return [
        { id: 'trendatr_xau', name: 'Gold', match: (p: Position) => ((p.strategy_id ?? '') as string).toLowerCase() === 'trendatr_xau' },
        { id: 'trendatr_nas', name: 'NAS100', match: (p: Position) => ((p.strategy_id ?? '') as string).toLowerCase() === 'trendatr_nas' },
      ];
    }
    if (instrument === 'gold') {
      return [
        { id: 'orb', name: 'ORB', match: (p: Position) => symbolMatch(p) && (((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('orb') || ((p.strategy_id ?? '') as string).toLowerCase() === 'orb') },
        { id: 'trendatr_xau', name: 'Trend Pullback', match: (p: Position) => symbolMatch(p) && ((p.strategy_id ?? '') as string).toLowerCase() === 'trendatr_xau' },
        { id: 'vwapReversion', name: 'VWAP Reversion', match: (p: Position) => symbolMatch(p) && (((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('vwap') || ((p.strategy_id ?? '') as string).toLowerCase() === 'vwapreversion') },
      ];
    }
    if (instrument === 'nas') {
      return [
        { id: 'orb', name: 'ORB', match: (p: Position) => symbolMatch(p) && (((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('orb') || ((p.strategy_id ?? '') as string).toLowerCase() === 'orb') },
        { id: 'trendatr_nas', name: 'Trend Pullback', match: (p: Position) => symbolMatch(p) && ((p.strategy_id ?? '') as string).toLowerCase() === 'trendatr_nas' },
        { id: 'vwapReversion', name: 'VWAP Reversion', match: (p: Position) => symbolMatch(p) && (((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase().includes('vwap') || ((p.strategy_id ?? '') as string).toLowerCase() === 'vwapreversion') },
      ];
    }
    return [
      { id: 'trendatr_xau', name: 'Gold', match: (p: Position) => ((p.strategy_id ?? '') as string).toLowerCase() === 'trendatr_xau' },
      { id: 'trendatr_nas', name: 'NAS100', match: (p: Position) => ((p.strategy_id ?? '') as string).toLowerCase() === 'trendatr_nas' },
    ];
  }, [title, instrument]);
  const visibleBotDefs = botDefs;
  const parseCap = (v: string | undefined): number | undefined => {
    if (v == null || v === '') return undefined; // unset = unlimited
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const capTrendAtrXau = parseCap((import.meta.env as any).VITE_CAP_TRENDATR_XAU ?? (import.meta.env as any).AUTOPILOT_CAP_TRENDATR_XAU);
  const capTrendAtrNas = parseCap((import.meta.env as any).VITE_CAP_TRENDATR_NAS ?? (import.meta.env as any).AUTOPILOT_CAP_TRENDATR_NAS);
  const capOrb = parseCap((import.meta.env as any).VITE_CAP_ORB ?? (import.meta.env as any).AUTOPILOT_CAP_ORB);
  const capVwap = parseCap((import.meta.env as any).VITE_CAP_VWAPREVERSION ?? (import.meta.env as any).AUTOPILOT_CAP_VWAPREVERSION);
  const botMetrics = useMemo(() => {
    const list = positions ?? [];
    const defs = visibleBotDefs;
    return defs.map(def => {
      const forBot = list.filter(p => ((p.strategy_id ?? '') as string).toLowerCase() === def.id);
      const closedR = forBot.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null && inRange(p.exit_ts ?? p.ts));
      const tradesTodayBot = forBot.filter(p => inRange(p.entry_ts ?? p.ts)).length;
      const winCountBot = closedR.filter(p => (p.pnl_gbp ?? 0) > 0).length;
      const totalPnlBot = closedR.reduce((a, p) => a + (p.pnl_gbp ?? 0), 0);
      const avgRBot = closedR.length ? closedR.reduce((a, p) => a + (p.R_multiple ?? 0), 0) / closedR.length : 0;
      const winRateBot = closedR.length ? (winCountBot / closedR.length) * 100 : 0;
      const open = isOpenWindow(def.id, now);
      const enabled = isEnabled(def.id);
      const status: 'Active' | 'Closed' | 'Disabled' = !enabled ? 'Disabled' : (open ? 'Active' : 'Closed');
      const indicator = !enabled ? 'red' : 'green';
      const cap = def.id === 'trendatr_xau' ? capTrendAtrXau : def.id === 'trendatr_nas' ? capTrendAtrNas : def.id === 'orb' ? capOrb : capVwap;
      const capLabel = cap === undefined ? '∞' : String(cap);
      // Last 5 trades for this bot
      const last5Trades = [...forBot]
        .sort((a, b) => new Date(b.exit_ts ?? b.entry_ts ?? b.ts).getTime() - new Date(a.exit_ts ?? a.entry_ts ?? a.ts).getTime())
        .slice(0, 5);
      // Latest 5 skip reasons from logs for this bot
      const messages: string[] = (schedulerActivity?.messages ?? []);
      const skipReasons = messages
        .filter(m => m.toLowerCase().includes('skip') && m.toLowerCase().includes(def.id))
        .slice(-5);
      return { id: def.id, name: def.name, tradesToday: tradesTodayBot, capLabel, winRate: winRateBot, avgR: avgRBot, pnl: totalPnlBot, status, indicator, recentTrades: last5Trades, skipReasons } as any;
    });
  }, [positions, range, schedulerActivity]);

  // Logs: filter messages by symbol tokens when strategyFilter provided
  const logs = useMemo(() => {
    const messages: string[] = (schedulerActivity?.messages ?? []);
    if (!filterTokens) return messages.slice(-20);
    const lower = filterTokens;
    return messages.filter(m => {
      const mm = m.toLowerCase();
      return lower.some(t => mm.includes(`[${t}]`));
    }).slice(-20);
  }, [schedulerActivity, filterTokens]);

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
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <NavLink to="/dashboard/overview" className={({ isActive }) => `px-3 py-1 rounded-xl inline-flex items-center transition ${isActive ? 'bg-[#16F29A]/15 text-[#16F29A]' : 'bg-[#111418] text-[#94A3B8] hover:bg-[#16F29A]/10 hover:text-[#16F29A]'}`}>Overview</NavLink>
            {(() => {
              const gold = botMetrics.find((b: any) => b.id === 'trendatr_xau');
              const goldBadge = gold ? (Math.abs(gold.pnl) < 0.005 ? '0 trades' : `${gold.pnl < 0 ? '–' : '+'}£${Math.abs(gold.pnl).toFixed(2)}`) : '—';
              const goldColor = gold && Math.abs(gold.pnl) >= 0.005 ? (gold.pnl > 0 ? 'text-green-300' : 'text-red-300') : 'text-gray-300';
              return (
                <NavLink to="/dashboard/gold" className={({ isActive }) => `px-3 py-2 rounded-xl inline-flex items-center transition ${isActive ? 'bg-[#16F29A]/15 text-[#16F29A]' : 'bg-[#111418] text-[#94A3B8] hover:bg-[#16F29A]/10 hover:text-[#16F29A]'}`}>
                  <span>Gold</span>
                  <span className={`ml-2 inline-flex items-center justify-center rounded-full px-3 py-1 text-xs leading-none bg-black/40 ${goldColor}`}>{goldBadge}</span>
                </NavLink>
              );
            })()}
            {(() => {
              const nas = botMetrics.find((b: any) => b.id === 'trendatr_nas');
              const nasBadge = nas ? (Math.abs(nas.pnl) < 0.005 ? '0 trades' : `${nas.pnl < 0 ? '–' : '+'}£${Math.abs(nas.pnl).toFixed(2)}`) : '—';
              const nasColor = nas && Math.abs(nas.pnl) >= 0.005 ? (nas.pnl > 0 ? 'text-green-300' : 'text-red-300') : 'text-gray-300';
              return (
                <NavLink to="/dashboard/nas100" className={({ isActive }) => `px-3 py-2 rounded-xl inline-flex items-center transition ${isActive ? 'bg-[#16F29A]/15 text-[#16F29A]' : 'bg-[#111418] text-[#94A3B8] hover:bg-[#16F29A]/10 hover:text-[#16F29A]'}`}>
                  <span>NAS100</span>
                  <span className={`ml-2 inline-flex items-center justify-center rounded-full px-3 py-1 text-xs leading-none bg-black/40 ${nasColor}`}>{nasBadge}</span>
                </NavLink>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Summary */}
      <SummaryBar tradesToday={tradesToday} totalPnl={totalPnl} winRate={winRate} profitFactor={profitFactor} avgR={avgR} windowStatus={autopilotLabel} range={range} onRangeChange={setRange} ledger={ledger ?? []} />

      {/* Bot Cards */}
      <div className="card-neon fade-in p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">{title === 'Overview' ? 'Bots Overview' : `${title} — Bots Overview`}</h3>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4`}>
          {botMetrics.map((b: any) => (
            <BotCard key={b.id} {...b} />
          ))}
        </div>
      </div>

      {/* Recent Trades + Logs (two-column) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TradesTable positions={closedInRange} rangeLabel={range} onRangeChange={setRange} />
        <LogsPanel logs={logs} />
      </div>
    </div>
  );
}