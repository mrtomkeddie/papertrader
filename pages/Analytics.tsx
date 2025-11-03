import React, { useEffect, useState } from 'react';
import { getPositions } from '../services/database'; // Assuming this fetches all positions
import { Position, PositionStatus } from '../types';

interface StrategyMetrics {
  totalTrades: number;
  winRate: number;
  avgR: number;
  maxDrawdown: number;
  totalProfit: number;
}

const Analytics: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsByStrategy, setMetricsByStrategy] = useState<Record<string, StrategyMetrics>>({});
  const [recentTrades, setRecentTrades] = useState<Position[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const allPositions = await getPositions(); // Fetch all positions
        const closedPositions = allPositions.filter(p => p.status === PositionStatus.CLOSED && p.pnl_gbp !== null && p.R_multiple !== null);

        // Sort for recent trades (assuming exit_ts is string ISO)
        const sortedTrades = [...closedPositions].sort((a, b) => new Date(b.exit_ts!).getTime() - new Date(a.exit_ts!).getTime());
        setRecentTrades(sortedTrades.slice(0, 10));

        // Group by strategy (method_name)
        const grouped: Record<string, Position[]> = {};
        closedPositions.forEach(pos => {
          const strat = pos.method_name || 'Unknown';
          if (!grouped[strat]) grouped[strat] = [];
          grouped[strat].push(pos);
        });

        // Calculate metrics per strategy
        const calculatedMetrics: Record<string, StrategyMetrics> = {};
        Object.entries(grouped).forEach(([strat, posList]) => {
          const totalTrades = posList.length;
          const wins = posList.filter(p => p.pnl_gbp! > 0).length;
          const winRate = totalTrades > 0 ? wins / totalTrades : 0;
          const avgR = totalTrades > 0 ? posList.reduce((sum, p) => sum + p.R_multiple!, 0) / totalTrades : 0;
          const totalProfit = posList.reduce((sum, p) => sum + p.pnl_gbp!, 0);

          // For drawdown, simulate equity curve
          let equity = 0;
          let peak = 0;
          let maxDD = 0;
          posList.sort((a, b) => new Date(a.entry_ts).getTime() - new Date(b.entry_ts).getTime()).forEach(p => {
            equity += p.pnl_gbp!;
            peak = Math.max(peak, equity);
            const dd = peak - equity;
            maxDD = Math.max(maxDD, dd);
          });
          const maxDrawdown = (maxDD / peak) * 100 || 0;

          calculatedMetrics[strat] = { totalTrades, winRate, avgR, maxDrawdown, totalProfit };
        });

        setMetricsByStrategy(calculatedMetrics);
      } catch (err) {
        setError('Failed to load analytics: ' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="text-center text-xl text-primary-light">Loading analytics...</div>;
  if (error) return <div className="text-center text-xl text-red-400">{error}</div>;

  return (
    <div className="p-2 sm:p-6 w-full space-y-6 sm:space-y-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Performance Analytics</h1>
      
      <div className="space-y-8">
        {(Object.entries(metricsByStrategy) as [string, StrategyMetrics][]).map(([strategy, metrics]) => (
          <div key={strategy} className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">{strategy} Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
              <div>
                <p className="text-sm text-gray-400">Total Trades</p>
                <p className="text-lg font-bold text-white">{metrics.totalTrades}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Win Rate</p>
                <p className="text-lg font-bold text-white">{(metrics.winRate * 100).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Average R</p>
                <p className="text-lg font-bold text-white">{metrics.avgR.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Max Drawdown</p>
                <p className="text-lg font-bold text-white">{metrics.maxDrawdown.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Profit</p>
                <p className="text-lg font-bold text-white">£{metrics.totalProfit.toFixed(2)}</p>
              </div>
            </div>
          </div>
        ))}

        <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Recent Trades</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 sm:px-4 sm:py-2 text-left text-[11px] tracking-wide text-gray-400">Symbol</th>
                  <th className="px-2 py-1 sm:px-4 sm:py-2 text-left text-[11px] tracking-wide text-gray-400">Strategy</th>
                  <th className="px-2 py-1 sm:px-4 sm:py-2 text-left text-[11px] tracking-wide text-gray-400">Side</th>
                  <th className="px-2 py-1 sm:px-4 sm:py-2 text-left text-[11px] tracking-wide text-gray-400">PnL (£)</th>
                  <th className="px-2 py-1 sm:px-4 sm:py-2 text-left text-[11px] tracking-wide text-gray-400">R Multiple</th>
                  <th className="px-2 py-1 sm:px-4 sm:py-2 text-left text-[11px] tracking-wide text-gray-400">Exit Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                {recentTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-700">
                    <td className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white">{trade.symbol}</td>
                    <td className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white">{trade.method_name || 'Unknown'}</td>
                    <td className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white">{trade.side}</td>
                    <td className={`px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm ${trade.pnl_gbp! > 0 ? 'text-accent' : 'text-red-400'}`}>{trade.pnl_gbp!.toFixed(2)}</td>
                    <td className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white">{trade.R_multiple!.toFixed(2)}</td>
                    <td className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white">{new Date(trade.exit_ts!).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;