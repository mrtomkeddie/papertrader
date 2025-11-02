import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import * as db from '../services/database'; // Now uses Firestore-backed functions
import { Side, PositionStatus, Position, Explanation, Strategy } from '../types';
import LightweightTradeChart from '../components/LightweightTradeChart';

const DetailItem: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color = 'text-white' }) => (
  <div>
    <p className="text-sm text-gray-400">{label}</p>
    <p className={`text-lg font-semibold ${color}`}>{value}</p>
  </div>
);

const PositionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  
  const { data: position, loading: positionLoading, error: positionError } = useDatabase<Position>('positions', id);
  const { data: explanations, loading: explanationsLoading } = useDatabase<Explanation[]>('explanations'); // Fetch all to find by position_id
  const { data: strategies, loading: strategiesLoading } = useDatabase<Strategy[]>('strategies');
  
  const explanation = useMemo(() => {
    if (!explanations || !id) return undefined;
    return explanations.find(e => e.position_id === id);
  }, [explanations, id]);

  const strategy = useMemo(() => {
    if (!position || !strategies || position.strategy_id === 'ai-generated') return undefined;
    return strategies.find(s => s.id === position.strategy_id);
  }, [position, strategies]);
  





  if (positionLoading || explanationsLoading || strategiesLoading) {
    return <div className="text-center text-xl text-primary-light">Loading trade details...</div>;
  }

  if (positionError) {
    return <div className="text-center text-xl text-red-400">Error loading position: {positionError}</div>;
  }

  if (!position) {
    return <div className="text-center text-xl">Position not found.</div>;
  }
  
  const pnlColor = position.pnl_gbp === null ? 'text-gray-400' : position.pnl_gbp >= 0 ? 'text-green-400' : 'text-red-400';
  const riskedAmount = Math.abs(position.entry_price - position.stop_price) * position.qty;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <h2 className="text-lg sm:text-3xl font-bold text-white">
          {position.symbol} Trade Details
        </h2>
        <span className={`self-start sm:self-auto px-2 py-0.5 text-xs font-semibold rounded-full ${position.status === PositionStatus.OPEN ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
            {position.status}
        </span>
      </div>

      <div className="card-premium p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
          <h3 className="text-base sm:text-xl font-semibold text-primary-light">Trade Explanation</h3>
        </div>
        <p className="text-xs sm:text-base text-gray-300 leading-relaxed">{explanation?.plain_english_entry || 'No explanation available.'}</p>
        {explanation?.beginner_friendly_entry && (
          <div className="mt-3 sm:mt-4">
            <p className="text-xs sm:text-sm text-gray-400 font-medium">In simple terms</p>
            <p className="text-xs sm:text-base text-gray-300 leading-relaxed">{explanation.beginner_friendly_entry}</p>
          </div>
        )}
        {explanation?.exit_reason && <p className="mt-3 sm:mt-4 text-xs sm:text-base text-gray-300"><strong>Exit Reason:</strong> {explanation.exit_reason}</p>}

      {explanation?.failure_analysis && (
        <div className="bg-red-900/20 border border-red-700/50 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base sm:text-xl font-semibold text-red-300">AI Post-Mortem Analysis</h3>
          </div>
          <p className="text-xs sm:text-base text-red-200/90 leading-relaxed">{explanation.failure_analysis}</p>
        </div>
      )}

      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="card-premium p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-4 sm:gap-y-8">
            <DetailItem label="Side" value={position.side} color={position.side === Side.LONG ? 'text-green-400' : 'text-red-400'} />
            <DetailItem label="Quantity" value={position.qty.toFixed(6)} />
            <DetailItem label="P&L" value={position.pnl_gbp !== null ? `£${position.pnl_gbp.toFixed(2)}` : 'N/A'} color={pnlColor}/>
            <DetailItem label="R-Multiple" value={position.R_multiple !== null ? `${position.R_multiple.toFixed(2)}R` : 'N/A'} color={pnlColor} />

            <DetailItem label="Entry Price" value={position.entry_price.toFixed(4)} />
            <DetailItem label="Stop Price" value={position.stop_price.toFixed(4)} />
            <DetailItem label="Target Price" value={position.tp_price.toFixed(4)} />
            <DetailItem label="Exit Price" value={position.exit_price !== null ? position.exit_price.toFixed(4) : 'N/A'} />

            <DetailItem label="Entry Time" value={new Date(position.entry_ts).toLocaleString()} />
            <DetailItem label="Exit Time" value={position.exit_ts ? new Date(position.exit_ts).toLocaleString() : 'N/A'} />
            <DetailItem label="Source" value={strategy?.name || 'AI Generated'} />
            <DetailItem label="Method" value={position.method_name || (position.strategy_id === 'ai-generated' ? 'AI' : strategy?.name || '—')} />
            <DetailItem label="Risked" value={`£${riskedAmount.toFixed(2)}`} />
            
            <DetailItem label="Slippage" value={`${position.slippage_bps} bps`} />
            <DetailItem label="Fee" value={`${position.fee_bps} bps`} />
        </div>
      </div>

      <div className="card-premium rounded-lg sm:rounded-xl shadow-lg h-[320px] sm:h-[420px] lg:h-[500px]">
        <LightweightTradeChart selectedPosition={position} />
      </div>
    </div>
  );
};

export default PositionDetail;