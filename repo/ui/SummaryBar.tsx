import React from 'react';
import EquitySparkline from '../components/EquitySparkline';
import { LedgerEntry } from '../types';

export type TimeRange = 'today' | 'week' | 'all';

interface SummaryBarProps {
  tradesToday: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  windowStatus: string; // e.g., "Enabled (forex)" | "Disabled"
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  ledger: LedgerEntry[];
}

const SummaryBar: React.FC<SummaryBarProps> = ({
  tradesToday,
  totalPnl,
  winRate,
  profitFactor,
  avgR,
  windowStatus,
  range,
  onRangeChange,
  ledger,
}) => {
  return (
    <div className="card-premium p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">Account Summary</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-text-secondary">Window</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-text-secondary">{windowStatus}</span>
        </div>
      </div>

      <div className="divider-glow my-4" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => onRangeChange('today')}
          data-active={range==='today'}
          className="px-3 py-1.5 text-sm rounded-full border border-transparent text-text-secondary hover:bg-[rgba(16,185,129,0.10)] hover:text-accent-green data-[active=true]:bg-[rgba(16,185,129,0.15)] data-[active=true]:text-accent-green"
        >
          Today
        </button>
        <button
          onClick={() => onRangeChange('week')}
          data-active={range==='week'}
          className="px-3 py-1.5 text-sm rounded-full border border-transparent text-text-secondary hover:bg-[rgba(16,185,129,0.10)] hover:text-accent-green data-[active=true]:bg-[rgba(16,185,129,0.15)] data-[active=true]:text-accent-green"
        >
          This Week
        </button>
        <button
          onClick={() => onRangeChange('all')}
          data-active={range==='all'}
          className="px-3 py-1.5 text-sm rounded-full border border-transparent text-text-secondary hover:bg-[rgba(16,185,129,0.10)] hover:text-accent-green data-[active=true]:bg-[rgba(16,185,129,0.15)] data-[active=true]:text-accent-green"
        >
          All Time
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-5 sm:gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Trades Today</p>
          <p className="font-mono text-xl sm:text-2xl font-bold text-white">{tradesToday}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Total P&L</p>
          <p className={`font-mono text-xl sm:text-2xl font-bold ${totalPnl > 0 ? 'text-accent-green' : totalPnl < 0 ? 'text-red-400' : 'text-text-secondary'}`}>£{totalPnl.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Win Rate</p>
          <p className="font-mono text-xl sm:text-2xl font-bold text-white">{winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Profit Factor</p>
          <p className="font-mono text-xl sm:text-2xl font-bold text-white">{profitFactor > 0 ? profitFactor.toFixed(2) : '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary mb-1">Risk-Reward (avg)</p>
          <p className="font-mono text-xl sm:text-2xl font-bold text-white">{avgR.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-4">
        <EquitySparkline ledger={ledger ?? []} range={range} />
      </div>
    </div>
  );
};

export default SummaryBar;