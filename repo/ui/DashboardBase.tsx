import React, { useMemo, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Strategy, LedgerEntry } from '../types';
import SummaryBar, { TimeRange } from './SummaryBar';
import BotCard from './BotCard';
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
  const lossCount = useMemo(() => closedInRange.filter(p => (p.pnl_gbp ?? 0) < 0).length, [closedInRange]);
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
    const defs = botDefs; // Always show all strategies; instrument pages filter positions
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

  // Instrument overview metrics for Overview page
  const instrumentTokens = {
    gold: ['gold', 'xau', 'xauusd', 'oanda:xauusd'],
    nas100: ['nas', 'nas100', 'us100', 'nas100_usd', 'oanda:nas100_usd'],
  } as const;

  const getInstrumentMetrics = (tokens: readonly string[]) => {
    const list = (positions ?? []).filter(p => {
      const text = `${p.strategy_id ?? ''} ${p.method_name ?? ''} ${p.symbol ?? ''}`.toLowerCase();
      return tokens.some(t => text.includes(t));
    });
    const closedR = list.filter((p): p is Required<Position> => p.status === PositionStatus.CLOSED && p.pnl_gbp != null && inRange(p.exit_ts ?? p.ts));
    const tradesTodayInst = list.filter(p => inRange(p.entry_ts ?? p.ts)).length;
    const winsInst = closedR.filter(p => (p.pnl_gbp ?? 0) > 0).length;
    const lossesInst = closedR.filter(p => (p.pnl_gbp ?? 0) < 0).length;
    const totalPnlInst = closedR.reduce((a, p) => a + (p.pnl_gbp ?? 0), 0);
    const avgRInst = closedR.length ? closedR.reduce((a, p) => a + (p.R_multiple ?? 0), 0) / closedR.length : 0;
    const winRateInst = closedR.length ? (winsInst / closedR.length) * 100 : 0;
    return { tradesToday: tradesTodayInst, wins: winsInst, losses: lossesInst, winRate: winRateInst, avgR: avgRInst, pnl: totalPnlInst };
  };

  const goldMetrics = useMemo(() => getInstrumentMetrics(instrumentTokens.gold), [positions, range]);
  const nasMetrics = useMemo(() => getInstrumentMetrics(instrumentTokens.nas100), [positions, range]);

  // Logs removed per request

  const AUTOPILOT_ENABLED = (import.meta.env.VITE_AUTOPILOT_ENABLED === '1' || import.meta.env.VITE_AUTOPILOT_ENABLED === 'true');
  const windowName = schedulerActivity?.window ?? 'none';
  const autopilotLabel = AUTOPILOT_ENABLED ? (windowName !== 'none' ? 'ENABLED' : 'DISABLED') : 'DISABLED';

  const location = useLocation();
  const tabs = [
    { to: '/dashboard/overview', label: 'Overview' },
    { to: '/dashboard/gold', label: 'Gold' },
    { to: '/dashboard/nas100', label: 'NAS100' },
  ];
  const activeIndex = Math.max(0, tabs.findIndex(t => t.to === location.pathname));

  if (positionsLoading || ledgerLoading || strategiesLoading) {
    return <div className="text-center text-xl text-primary-light">Loading data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">{title === 'Overview' ? 'Dashboard' : title}</h2>
          <div className="mt-3 -mx-1 px-1">
            <div className="segmented text-sm" style={{ ['--index' as any]: activeIndex }}>
              {tabs.map(({ to, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `segmented-item`} data-active={location.pathname === to ? 'true' : 'false'}>
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <SummaryBar totalPnl={totalPnl} winRate={winRate} wins={winCount} losses={lossCount} windowStatus={autopilotLabel} range={range} onRangeChange={setRange} ledger={ledger ?? []} />

      {/* Bot / Instrument Cards */}
      {!strategyFilter ? (
        <div className="card-premium p-6 fade-in">
          <h3 className="text-lg font-semibold tracking-tight mb-4">Instruments Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gold */}
            <div className="card-premium p-5">
              <div className="section-head flex items-center justify-between mb-4 p-2 rounded">
                <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-glow)]"></span>
                  <span className="text-base font-semibold text-white">Gold</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${autopilotLabel === 'ENABLED' ? 'badge-enabled border-transparent' : 'border-border text-text-secondary'}`}>{autopilotLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">Trades Today</p>
                  <p className="font-mono text-white text-3xl font-semibold">{goldMetrics.tradesToday}</p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">Win Rate</p>
                  <p className="font-mono text-white text-3xl font-semibold">{goldMetrics.winRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">Wins / Losses</p>
                  <p className="font-mono text-3xl font-semibold"><span className="text-accent-green">{goldMetrics.wins}</span> <span className="text-text-secondary">/</span> <span className="text-red-400">{goldMetrics.losses}</span></p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">P&L</p>
                  <p className={`font-mono text-3xl font-semibold ${goldMetrics.pnl >= 0 ? 'text-accent-green' : 'text-red-400'}`}>£{goldMetrics.pnl.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* NAS100 */}
            <div className="card-premium p-5">
              <div className="section-head flex items-center justify-between mb-4 p-2 rounded">
                <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-glow)]"></span>
                  <span className="text-base font-semibold text-white">NAS100</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${autopilotLabel === 'ENABLED' ? 'badge-enabled border-transparent' : 'border-border text-text-secondary'}`}>{autopilotLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">Trades Today</p>
                  <p className="font-mono text-white text-3xl font-semibold">{nasMetrics.tradesToday}</p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">Win Rate</p>
                  <p className="font-mono text-white text-3xl font-semibold">{nasMetrics.winRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">Wins / Losses</p>
                  <p className="font-mono text-3xl font-semibold"><span className="text-accent-green">{nasMetrics.wins}</span> <span className="text-text-secondary">/</span> <span className="text-red-400">{nasMetrics.losses}</span></p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-text-secondary mb-1">P&L</p>
                  <p className={`font-mono text-3xl font-semibold ${nasMetrics.pnl >= 0 ? 'text-accent-green' : 'text-red-400'}`}>£{nasMetrics.pnl.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold text-white mb-4">Bot (Filtered)</h3>
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4`}>
            {botMetrics.map(b => (
              <BotCard key={b.id} {...b} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Trades removed per request */}

      {/* Scheduler Logs removed per request */}
    </div>
  );
}