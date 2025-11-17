import React from 'react';

interface BotCardProps {
  id: string;
  name: string;
  status: 'Active' | 'Closed' | 'Disabled';
  indicator: 'green' | 'gray' | 'red';
  tradesToday: number;
  capLabel: string; // display-only; '∞' for unlimited
  winRate: number;
  avgR: number;
  pnl: number;
  recentTrades?: Array<{ id?: string; entry_ts?: string | null; exit_ts?: string | null; side?: string; pnl_gbp?: number | null; symbol?: string; R_multiple?: number | null; status?: string }>;
  skipReasons?: string[];
}

const BotCard: React.FC<BotCardProps> = ({ id, name, status, indicator, tradesToday, capLabel, winRate, avgR, pnl, recentTrades = [], skipReasons = [] }) => {
  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  const fmtGBP = (n?: number | null) => {
    if (n == null || Math.abs(n) < 0.005) return '—';
    const sign = (n ?? 0) < 0 ? '-' : '';
    const abs = Math.abs(n ?? 0);
    return `${sign}£${abs.toFixed(2)}`;
  };
  const [now, setNow] = React.useState<Date>(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
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
    const hour = d.getUTCHours(); const min = d.getUTCMinutes();
    if (id === 'trendatr_xau') return hour >= 12 && hour < 20;
    if (id === 'trendatr_nas') return ((hour > 14) || (hour === 14 && min >= 30)) && hour < 20;
    if (id === 'orb') return (hour >= 12 && hour < 20) && (hour > 12 || (hour === 12 && min >= 15));
    if (id === 'vwapReversion') return hour >= 14 && hour < 17;
    return false;
  };
  const nextOpen = (id: string, from: Date) => {
    if (id === 'fixed' || id === 'fixed-xau' || id === 'fixed-nas') {
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
    const advanceToWeekday = (x: Date) => { let y = new Date(x); let day = y.getUTCDay(); while (day === 0 || day === 6) { y.setUTCDate(y.getUTCDate() + 1); day = y.getUTCDay(); } return y; };
    const base = advanceToWeekday(from);
    if (id === 'trendatr_xau') { const d = new Date(base); d.setUTCHours(12,0,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    if (id === 'trendatr_nas') { const d = new Date(base); d.setUTCHours(14,30,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    if (id === 'orb') { const d = new Date(base); d.setUTCHours(12,15,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    if (id === 'vwapReversion') { const d = new Date(base); d.setUTCHours(14,0,0,0); if (from <= d) return d; d.setUTCDate(d.getUTCDate() + 1); return advanceToWeekday(d); }
    return base;
  };
  const endToday = (id: string, from: Date) => {
    if (id === 'fixed' || id === 'fixed-xau' || id === 'fixed-nas') {
      const open = getNyOpenUtc(from);
      return new Date(open.getTime() + 3 * 60 * 60_000);
    }
    const t = new Date(from); t.setUTCHours(20,0,0,0); return t;
  };
  const fmtCountdown = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };
  const open = isOpenWindow(id, now);
  const next = nextOpen(id, now);
  const closesIn = Math.max(0, endToday(id, now).getTime() - now.getTime());
  const opensIn = Math.max(0, next.getTime() - now.getTime());

  const subtext = id === 'fixed' ? 'NY OR Window • Mon–Fri'
    : id === 'fixed-xau' ? 'XAUUSD • NY OR Window • Mon–Fri'
    : id === 'fixed-nas' ? 'NAS100 • NY OR Window • Mon–Fri'
    : id === 'trendatr_xau' ? 'XAUUSD • 15m • 12:00–20:00 UTC'
    : id === 'trendatr_nas' ? 'NAS100 • 15m • 14:30–20:00 UTC'
    : id === 'orb' ? 'XAUUSD • 15m • 12:15–20:00 UTC'
    : id === 'vwapReversion' ? 'XAUUSD • 15m • 14:00–17:00 UTC' : '';
  const statusEmoji = status === 'Active' ? '🟢' : status === 'Closed' ? '⚪' : '🔴';
const pnlColor = pnl > 0 ? 'text-accent-green' : pnl < 0 ? 'text-red-300' : 'text-gray-400';


  // Progress bar when window is open
  const windowStart = React.useMemo(() => {
    if (id === 'fixed' || id === 'fixed-xau' || id === 'fixed-nas') {
      const open = getNyOpenUtc(now);
      return new Date(open.getTime() + 15 * 60_000);
    }
    const d = new Date(now);
    if (id === 'trendatr_xau') { d.setUTCHours(12,0,0,0); }
    else if (id === 'trendatr_nas') { d.setUTCHours(14,30,0,0); }
    else if (id === 'orb') { d.setUTCHours(12,15,0,0); }
    else if (id === 'vwapReversion') { d.setUTCHours(14,0,0,0); }
    else { d.setUTCHours(0,0,0,0); }
    return d;
  }, [id, now]);
  const windowEnd = React.useMemo(() => {
    if (id === 'fixed' || id === 'fixed-xau' || id === 'fixed-nas') {
      const open = getNyOpenUtc(now);
      return new Date(open.getTime() + 3 * 60 * 60_000);
    }
    const t = new Date(now);
    if (id === 'vwapReversion') { t.setUTCHours(17,0,0,0); } else { t.setUTCHours(20,0,0,0); }
    return t;
  }, [now, id]);
  const durationMs = Math.max(0, windowEnd.getTime() - windowStart.getTime());
  const elapsedMs = Math.max(0, now.getTime() - windowStart.getTime());
  const progressPct = open && durationMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100)) : 0;

  return (
    <div className={`card-premium fade-in p-4 transition`} aria-label={`${name} bot card`}>
      {/* Header: Name left, Status chip right */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-200">{name}</h4>
        <span className="badge-active text-[11px] sm:text-xs leading-none mr-1">{statusEmoji} {status}</span>
      </div>
      {/* Subtext */}
      <p className="mt-1 text-[11px] sm:text-xs text-gray-400">{subtext}</p>

      {/* Today metrics – cleaner grid */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs sm:text-sm text-gray-300">
        <div>
          <p className="text-[11px] tracking-wide text-text-secondary">Trades today</p>
          <p className="font-mono">{tradesToday} <span className="text-[10px] text-gray-500">/ {capLabel}</span></p>
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-text-secondary">Win rate</p>
          <p className="font-mono">{winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[11px] tracking-wide text-text-secondary">P&L</p>
          <p className={`font-mono ${pnlColor}`}>{fmtGBP(pnl)}</p>
        </div>
      </div>

      {/* Next window / countdown */}
      <div className="mt-2 text-[11px] sm:text-xs text-gray-400">
        {status === 'Disabled' ? (
          <span>Bot disabled</span>
        ) : open ? (
          <span>Open • Closes in {fmtCountdown(closesIn)}</span>
        ) : (
          <span>Next window: Opens in {fmtCountdown(opensIn)}</span>
        )}
      </div>

      {/* Progress bar when open */}
      {open && (
        <div className="mt-2 progress-track">
          <div className="progress-accent opacity-70" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* Sparkline removed per request */}

      

      {/* Trades and Skips */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <h5 className="text-sm font-medium text-gray-300 mb-2">Last 5 Trades</h5>
          <ul className="space-y-2 text-xs text-gray-300">
            {recentTrades.map((t, idx) => {
              const r = (t?.R_multiple ?? null) as number | null;
              const rColor = (r ?? 0) >= 0 ? 'bg-[rgba(16,185,129,0.15)] text-accent-green' : 'bg-red-700/30 text-red-200';
              return (
                <li key={t.id ?? idx} className="flex items-center justify-between bg-black/30 p-2 rounded">
                  <div className="flex items-center gap-2">
            <span className={t?.side === 'LONG' ? 'text-accent-green' : 'text-red-300'}>{t?.side ?? '—'}</span>
                    <span className="text-gray-400">{t?.symbol ?? ''}</span>
                    <span className="text-gray-500">{fmtDate(t?.exit_ts ?? t?.entry_ts)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${rColor}`}>{typeof r === 'number' ? r.toFixed(2) : '—'}</span>
            <span className={((t?.pnl_gbp ?? 0) > 0) ? 'text-accent-green' : ((t?.pnl_gbp ?? 0) < 0) ? 'text-red-300' : 'text-gray-400'}>{fmtGBP(t?.pnl_gbp)}</span>
                  </div>
                </li>
              );
            })}
            {recentTrades.length === 0 && (
              <li className="text-gray-400">No trades yet.</li>
            )}
          </ul>
        </div>
        <div>
          <h5 className="text-sm font-medium text-gray-300 mb-2">Latest 5 Skips</h5>
          <ul className="space-y-2 text-xs text-gray-300">
            {skipReasons.slice(-5).map((m, idx) => (
              <li key={idx} className="bg-black/30 p-2 rounded">{m}</li>
            ))}
            {skipReasons.length === 0 && (
              <li className="text-gray-400">No recent skips.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BotCard;