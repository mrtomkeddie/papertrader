import React, { useState } from 'react';
import { runBacktest, BacktestResult } from '../services/backtestService';
import { SELECTED_INSTRUMENTS } from '../constants';

const Backtest: React.FC = () => {
  const [symbol, setSymbol] = useState(SELECTED_INSTRUMENTS[0]);
  const [strategy, setStrategy] = useState<'ORB' | 'TrendPullback' | 'VWAPReversion'>('ORB');
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [interval, setInterval] = useState('1h');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const backtestResult = await runBacktest(symbol, strategy, startDate, endDate, interval);
      setResult(backtestResult);
    } catch (err) {
      setError('Failed to run backtest: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Strategy Backtester</h1>
      
      <div className="card-premium p-4 sm:p-6 rounded-lg shadow-lg mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
            <select 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full searchbar rounded-md px-3 py-2"
            >
              {SELECTED_INSTRUMENTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Strategy</label>
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value as any)}
              className="w-full searchbar rounded-md px-3 py-2"
            >
              <option value="ORB">Opening Range Breakout</option>
              <option value="TrendPullback">Trend Pullback</option>
              <option value="VWAPReversion">VWAP Reversion</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full searchbar rounded-md px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full searchbar rounded-md px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Interval</label>
            <select 
              value={interval} 
              onChange={(e) => setInterval(e.target.value)}
              className="w-full searchbar rounded-md px-3 py-2"
            >
              <option value="1h">1 Hour</option>
              <option value="4h">4 Hours</option>
              <option value="1d">Daily</option>
            </select>
          </div>
        </div>
        
        <button 
          onClick={handleRunBacktest}
          disabled={loading}
          className="mt-4 w-full px-4 py-2 bg-[rgba(24,24,24,0.9)] text-white rounded-md ring-1 ring-white/10 hover:bg-[rgba(24,24,24,0.75)] transition disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Backtest'}
        </button>
      </div>

      {error && <div className="text-red-400 mb-4">{error}</div>}

      {result && (
        <div className="card-premium p-4 sm:p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Backtest Results</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-400">Total Trades</p>
              <p className="text-lg font-bold text-white">{result.totalTrades}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Win Rate</p>
              <p className="text-lg font-bold text-white">{(result.winRate * 100).toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Average R</p>
              <p className="text-lg font-bold text-white">{result.avgR.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Max Drawdown</p>
              <p className="text-lg font-bold text-white">{result.maxDrawdown.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Profit</p>
              <p className="text-lg font-bold text-white">${result.totalProfit.toFixed(2)}</p>
            </div>
          </div>

          <h3 className="text-lg font-bold text-white mb-2">Trade History</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full table-premium">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-[11px] tracking-wide text-text-secondary">Entry Time</th>
                  <th className="px-4 py-2 text-left text-[11px] tracking-wide text-text-secondary">Side</th>
                  <th className="px-4 py-2 text-left text-[11px] tracking-wide text-text-secondary">Entry Price</th>
                  <th className="px-4 py-2 text-left text-[11px] tracking-wide text-text-secondary">Exit Price</th>
                  <th className="px-4 py-2 text-left text-[11px] tracking-wide text-text-secondary">PnL</th>
                  <th className="px-4 py-2 text-left text-[11px] tracking-wide text-text-secondary">R Multiple</th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {result.trades.map((trade, index) => (
                  <tr key={index} className="hover:bg-[rgba(24,24,24,0.6)]">
                    <td className="px-4 py-2 text-sm text-white">{new Date(trade.entryTime * 1000).toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm text-white">{trade.side}</td>
                    <td className="px-4 py-2 text-sm text-white">{trade.entryPrice.toFixed(4)}</td>
                    <td className="px-4 py-2 text-sm text-white">{trade.exitPrice.toFixed(4)}</td>
                    <td className={`px-4 py-2 text-sm ${trade.pnl > 0 ? 'text-accent-green' : 'text-red-400'}`}>{trade.pnl.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm text-white">{trade.rMultiple.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backtest;