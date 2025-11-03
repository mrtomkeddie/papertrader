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
    <div className="card-premium p-5 sm:p-6 rounded-lg shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Account Summary</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Window</span>
          <span className="px-2 py-1 rounded bg-gray-800 text-xs text-gray-200">{windowStatus}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => onRangeChange('today')} className={`px-3 py-1 rounded text-xs ${range==='today'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>Today</button>
        <button onClick={() => onRangeChange('week')} className={`px-3 py-1 rounded text-xs ${range==='week'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>This Week</button>
        <button onClick={() => onRangeChange('all')} className={`px-3 py-1 rounded text-xs ${range==='all'?'bg-gray-700 text-white':'bg-gray-800 text-gray-300'}`}>All Time</button>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-gray-300">
        <div>
          <p className="text-gray-400">Trades Today</p>
          <p className="font-mono text-xl">{tradesToday}</p>
        </div>
        <div>
          <p className="text-gray-400">Total P&L</p>
          <p className={`font-mono text-xl ${totalPnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{totalPnl.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400">Win Rate</p>
          <p className="font-mono text-xl">{winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-gray-400">Profit Factor</p>
          <p className="font-mono text-xl">{profitFactor > 0 ? profitFactor.toFixed(2) : '—'}</p>
        </div>
        <div>
          <p className="text-gray-400">Risk-Reward (avg)</p>
          <p className="font-mono text-xl">{avgR.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-4">
        <EquitySparkline ledger={ledger ?? []} range={range} />
      </div>
    </div>
  );
};

export default SummaryBar;