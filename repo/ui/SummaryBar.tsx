import React, { useMemo } from 'react';
import EquitySparkline from '../components/EquitySparkline';
import { LedgerEntry } from '../types';

export type TimeRange = 'today' | 'week' | 'all';

interface SummaryBarProps {
  title?: string;
  hideAccountBalance?: boolean;
  totalPnl: number;
  winRate: number;
  wins: number;
  losses: number;
  windowStatus: string; // e.g., "Enabled (forex)" | "Disabled"
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  ledger: LedgerEntry[];
}

const SummaryBar: React.FC<SummaryBarProps> = ({
  title,
  hideAccountBalance,
  totalPnl,
  winRate,
  wins,
  losses,
  windowStatus,
  range,
  onRangeChange,
  ledger,
}) => {
  // Compute dynamic account balance from ledger
  const baseAccountGbp = Number(import.meta.env.VITE_AUTOPILOT_ACCOUNT_GBP ?? 250);
  const latestCashAfter = useMemo(() => {
    if (!ledger || ledger.length === 0) return 0;
    const sorted = [...ledger].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return sorted[sorted.length - 1].cash_after || 0;
  }, [ledger]);
  const accountBalance = useMemo(() => baseAccountGbp + latestCashAfter, [baseAccountGbp, latestCashAfter]);
  return (
    <div className="card-premium p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">{title ?? 'Account Summary'}</h3>
        <div className="pill-dropdown">
          <select
            aria-label="Time range"
            className="pill-select compact"
            value={range}
            onChange={(e) => onRangeChange(e.target.value as TimeRange)}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      <div className="divider-glow my-4" />


      <div className={`mt-4 grid grid-cols-2 ${hideAccountBalance ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-5 sm:gap-6`}>
        {!hideAccountBalance && (
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Account Balance</p>
            <p className="font-mono text-xl sm:text-2xl font-bold text-white">£{accountBalance.toFixed(2)}</p>
          </div>
        )}
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Total P&L</p>
          <p className={`font-mono text-xl sm:text-2xl font-bold ${totalPnl > 0 ? 'text-accent-green' : totalPnl < 0 ? 'text-red-400' : 'text-text-secondary'}`}>£{totalPnl.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Win Rate</p>
          <p className="font-mono text-xl sm:text-2xl font-bold text-white">{winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Wins / Losses</p>
          <p className="font-mono text-xl sm:text-2xl font-bold"><span className="text-accent-green">{wins}</span> <span className="text-text-secondary">/</span> <span className="text-red-400">{losses}</span></p>
        </div>
      </div>

      <div className="mt-4">
        <EquitySparkline ledger={ledger ?? []} range={range} />
      </div>
    </div>
  );
};

export default SummaryBar;