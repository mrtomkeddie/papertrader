import React, { useMemo, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { Position, PositionStatus, Strategy, LedgerEntry, Side } from '../types';
import SummaryBar, { TimeRange } from './SummaryBar';
import BotCard from './BotCard';
import { NavLink, useLocation, useSearchParams, useNavigate } from 'react-router-dom';

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
      : ['fixed-xau','fixed-nas'];
  }, []);
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
    if (id === 'fixed' || id === 'fixed-xau' || id === 'fixed-nas') {
      const open = getNyOpenUtc(d);
      const orEnd = new Date(open.getTime() + 15 * 60_000);
      const windowEnd = new Date(open.getTime() + 3 * 60 * 60_000);
      return d >= orEnd && d <= windowEnd;
    }
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

  const navigate = useNavigate();
  const [instrumentFilter, setInstrumentFilter] = React.useState<'all' | 'gold' | 'nas100'>('all');
  // Independent table range state
  const [tableRange, setTableRange] = React.useState<TimeRange>('today');
  // Strategy filter for Recent Trades table
  const [strategyFilterTable, setStrategyFilterTable] = React.useState<'all' | 'orb' | 'trend' | 'vwap'>('all');
  const inTableRange = (ts?: string | null) => {
    if (!ts) return false;
    const t = new Date(ts);
    if (tableRange === 'today') return t >= startOfToday;
    if (tableRange === 'week') return t >= startOfWeek;
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

  // Instrument tokens used for scoping dashboards and overview metrics
  const instrumentTokens = {
    gold: ['gold', 'xau', 'xauusd', 'oanda:xauusd'],
    nas100: ['nas', 'nas100', 'us100', 'nas100_usd', 'oanda:nas100_usd'],
  } as const;

  // Ensure instrument-specific filtering on instrument pages
  const requiredInstrumentTokens: readonly string[] | undefined = useMemo(() => {
    const t = title.toLowerCase();
    if (t.includes('gold')) return instrumentTokens.gold;
    if (t.includes('nas')) return instrumentTokens.nas100;
    return undefined;
  }, [title]);

  const matchesFilter = (p: Position): boolean => {
    const text = `${p.strategy_id ?? ''} ${p.method_name ?? ''} ${p.symbol ?? ''}`.toLowerCase();
    const strategyOk = !expandedTokens || expandedTokens.some(t => text.includes(t));
    const instrumentOk = !requiredInstrumentTokens || requiredInstrumentTokens.some(t => text.includes(t));
    return strategyOk && instrumentOk;
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

  const recentTrades = useMemo(() => {
    const list = positions ?? [];
    const tokens = instrumentFilter === 'gold' ? instrumentTokens.gold : instrumentFilter === 'nas100' ? instrumentTokens.nas100 : undefined;
    const filteredByInst = tokens
      ? list.filter(p => {
          const text = `${p.strategy_id ?? ''} ${p.method_name ?? ''} ${p.symbol ?? ''}`.toLowerCase();
          return tokens.some(t => text.includes(t));
        })
      : list;
    const filteredByStrategy = strategyFilterTable === 'all' ? filteredByInst : filteredByInst.filter(p => {
      const text = `${p.strategy_id ?? ''} ${p.method_name ?? ''}`.toLowerCase();
      if (strategyFilterTable === 'orb') return text.includes('orb');
      if (strategyFilterTable === 'trend') return text.includes('trend');
      if (strategyFilterTable === 'vwap') return text.includes('vwap');
      return true;
    });
    const filtered = filteredByStrategy.filter(p => inTableRange(p.exit_ts ?? p.entry_ts ?? p.ts));
    return filtered
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.exit_ts ?? a.entry_ts ?? a.ts ?? 0).getTime();
        const tb = new Date(b.exit_ts ?? b.entry_ts ?? b.ts ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 20);
  }, [positions, instrumentFilter, strategyFilterTable, tableRange]);

  // Bot metrics (re-usable)
  const botDefs = useMemo(() => {
    const defs = [
      { id: 'fixed-xau', name: 'Fixed ORB + FVG + LVN (Gold)', match: (p: Position) => {
        const text = ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase();
        return text.includes('fixed-orb-fvg-lvn') && ((p.symbol ?? '').toUpperCase().includes('XAU'));
      } },
      { id: 'fixed-nas', name: 'Fixed ORB + FVG + LVN (NAS100)', match: (p: Position) => {
        const text = ((p.method_name ?? p.strategy_id ?? '') as string).toLowerCase();
        return text.includes('fixed-orb-fvg-lvn') && ((p.symbol ?? '').toUpperCase().includes('NAS'));
      } },
    ];
    const t = title.toLowerCase();
    if (t.includes('gold')) return [defs[0]];
    if (t.includes('nas')) return [defs[1]];
    return defs;
  }, [title]);
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
      <SummaryBar
        title={`${title} Summary`}
        hideAccountBalance
        totalPnl={totalPnl}
        winRate={winRate}
        wins={winCount}
        losses={lossCount}
        windowStatus={autopilotLabel}
        range={range}
        onRangeChange={setRange}
        ledger={ledger ?? []}
      />

      {title === 'Overview' && (
        <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Recent Trades</h3>
            <div className="flex items-center gap-4">
              <div className="pill-dropdown">
                <select
                  aria-label="Instrument filter"
                  className="pill-select compact"
                  value={instrumentFilter}
                  onChange={e => setInstrumentFilter(e.target.value as 'all' | 'gold' | 'nas100')}
                >
                  <option value="all">All</option>
                  <option value="gold">Gold</option>
                  <option value="nas100">NAS100</option>
                </select>
              </div>
              <div className="pill-dropdown">
                <select
                  aria-label="Strategy filter"
                  className="pill-select compact"
                  value={strategyFilterTable}
                  onChange={e => setStrategyFilterTable(e.target.value as 'all' | 'orb' | 'trend' | 'vwap')}
                >
                  <option value="all">All Strategies</option>
                  <option value="orb">ORB</option>
                  <option value="trend">Trend Pullback</option>
                  <option value="vwap">VWAP Reversion</option>
                </select>
              </div>
              <div className="pill-dropdown">
                <select
                  aria-label="Time range"
                  className="pill-select compact"
                  value={tableRange}
                  onChange={e => setTableRange(e.target.value as TimeRange)}
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="all">All Time</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg overflow-hidden">
            <table className="min-w-full table-premium recent-trades-table">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Symbol</th>
                  <th className="text-right">P&L (GBP)</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map(p => {
                  const when = new Date(p.exit_ts ?? p.entry_ts ?? p.ts ?? 0);
                  const pnl = p.pnl_gbp ?? 0;
                  return (
                    <tr key={p.id || `${p.symbol}-${when.getTime()}`}
                        className="cursor-pointer hover:bg-elevation-2"
                        onClick={() => p.id && navigate(`/positions/${p.id}`)}>
                      <td>{when.toLocaleString()}</td>
                      <td className="uppercase">{p.symbol || '-'}</td>
                      <td className={`text-right ${pnl > 0 ? 'text-accent-green' : pnl < 0 ? 'text-red-300' : ''}`}>{pnl.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {recentTrades.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-gray-400 py-4">No trades found for selected filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bot cards only on instrument pages; nothing extra on Overview */}
      {title !== 'Overview' && (
        <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold text-white mb-4">Bots Overview</h3>
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