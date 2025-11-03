import React from 'react';

interface BotCardProps {
  id: string;
  name: string;
  status: 'Active' | 'Closed' | 'Disabled';
  indicator: 'green' | 'gray' | 'red';
  tradesToday: number;
  cap: number;
  winRate: number;
  avgR: number;
  pnl: number;
}

const BotCard: React.FC<BotCardProps> = ({ id, name, status, indicator, tradesToday, cap, winRate, avgR, pnl }) => {
  return (
    <div className="card-premium p-4 rounded-lg shadow-lg hover:bg-gray-800/50 transition" aria-label={`${name} bot card`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${indicator==='green'?'bg-green-400':indicator==='red'?'bg-red-400':'bg-gray-400'}`} />
          <h4 className="text-base font-semibold text-white">{name}</h4>
        </div>
        <span className="text-xs text-gray-400">{status}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-300">
        <div>
          <p className="text-gray-400">Trades Today</p>
          <p className="font-mono text-lg">{tradesToday} / {cap}</p>
        </div>
        <div>
          <p className="text-gray-400">Win Rate</p>
          <p className="font-mono text-lg">{winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-gray-400">Avg R</p>
          <p className="font-mono text-lg">{avgR.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400">P&L</p>
          <p className={`font-mono text-lg ${pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>£{pnl.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default BotCard;