import React, { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import * as db from '../services/database'; // Now uses Firestore-backed functions
import { Side, PositionStatus, Position, Explanation, Strategy } from '../types';
import TradingViewWidget from '../components/TradingViewWidget';
import { generateExplanationText, generateFailureAnalysis } from '../services/geminiService';

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
  
  // Regenerate explanation state
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenSuccess, setRegenSuccess] = useState<boolean>(false);

  // Regenerate failure analysis state
  const [isRegeneratingAnalysis, setIsRegeneratingAnalysis] = useState<boolean>(false);
  const [regenAnalysisError, setRegenAnalysisError] = useState<string | null>(null);
  const [regenAnalysisSuccess, setRegenAnalysisSuccess] = useState<boolean>(false);

  const handleRegenerateExplanation = async () => {
    if (!position || !strategy) {
      setRegenError('Missing strategy for this position. Enable the strategy to regenerate.');
      return;
    }
    setIsRegenerating(true);
    setRegenError(null);
    setRegenSuccess(false);
    try {
      const text = await generateExplanationText(position, strategy);
      if (explanation?.id) {
        const updated: Explanation = { ...explanation, plain_english_entry: text, failure_analysis: null };
        await db.updateExplanation(updated);
      } else {
        await db.addExplanation({ position_id: position.id, plain_english_entry: text, exit_reason: null });
      }
      setRegenSuccess(true);
    } catch (err: any) {
      setRegenError(err?.message ?? 'Failed to regenerate explanation');
    } finally {
      setIsRegenerating(false);
      setTimeout(() => setRegenSuccess(false), 2500);
    }
  };

  const handleRegenerateFailureAnalysis = async () => {
    if (!position || !explanation) {
      setRegenAnalysisError('Missing position or explanation data. Regenerate the explanation first.');
      return;
    }
    setIsRegeneratingAnalysis(true);
    setRegenAnalysisError(null);
    setRegenAnalysisSuccess(false);
    try {
      const text = await generateFailureAnalysis(position, explanation);
      const updated: Explanation = { ...explanation, failure_analysis: text };
      await db.updateExplanation(updated);
      setRegenAnalysisSuccess(true);
    } catch (err: any) {
      setRegenAnalysisError(err?.message ?? 'Failed to regenerate analysis');
    } finally {
      setIsRegeneratingAnalysis(false);
      setTimeout(() => setRegenAnalysisSuccess(false), 2500);
    }
  };

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">
          {position.symbol} Trade Details
        </h2>
        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${position.status === PositionStatus.OPEN ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
            {position.status}
        </span>
      </div>

      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-primary-light">Trade Explanation</h3>
          <div className="flex items-center gap-3">
            {regenSuccess && <span className="text-green-400">Updated</span>}
            {regenError && <span className="text-red-400">{regenError}</span>}
            <button
              className="px-3 py-2 rounded bg-blue-600 disabled:opacity-60"
              disabled={isRegenerating || !strategy}
              onClick={handleRegenerateExplanation}
            >{isRegenerating ? 'Regenerating…' : 'Regenerate Explanation'}</button>
          </div>
        </div>
        <p className="text-gray-300 leading-relaxed">{explanation?.plain_english_entry || 'No explanation available.'}</p>
        {explanation?.exit_reason && <p className="mt-4 text-gray-300"><strong>Exit Reason:</strong> {explanation.exit_reason}</p>}
      </div>

      {explanation?.failure_analysis && (
        <div className="bg-red-900/20 border border-red-700/50 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-red-300">AI Post-Mortem Analysis</h3>
              <div className="flex items-center gap-3">
                {regenAnalysisSuccess && <span className="text-green-400">Updated</span>}
                {regenAnalysisError && <span className="text-red-400">{regenAnalysisError}</span>}
                <button
                  className="px-3 py-2 rounded bg-red-600 disabled:opacity-60"
                  disabled={isRegeneratingAnalysis || !explanation}
                  onClick={handleRegenerateFailureAnalysis}
                >{isRegeneratingAnalysis ? 'Regenerating…' : 'Regenerate Analysis'}</button>
              </div>
            </div>
            <p className="text-red-200/90 leading-relaxed">{explanation.failure_analysis}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
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

      <div className="bg-gray-800 rounded-lg shadow-lg h-[500px]">
        <TradingViewWidget symbol={position.symbol} timeframe={strategy?.timeframe} />
      </div>
    </div>
  );
};

export default PositionDetail;