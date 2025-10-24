import React, { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDatabase } from '../hooks/useDatabase';
import * as db from '../services/database'; // Now uses Firestore-backed functions
import { Side, PositionStatus, Position, Explanation, Strategy } from '../types';
import TradingViewWidget from '../components/TradingViewWidget';
import { generateExplanationText, generateFailureAnalysis } from '../services/geminiService';
import AnnotatedChart from '../components/AnnotatedChart';

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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <h2 className="text-lg sm:text-3xl font-bold text-white">
          {position.symbol} Trade Details
        </h2>
        <span className={`self-start sm:self-auto px-2 py-0.5 text-xs font-semibold rounded-full ${position.status === PositionStatus.OPEN ? 'bg-blue-900 text-blue-300' : 'bg-gray-600 text-gray-300'}`}>
            {position.status}
        </span>
      </div>

      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
          <h3 className="text-base sm:text-xl font-semibold text-primary-light">Trade Explanation</h3>
          <div className="flex w-full sm:w-auto items-center justify-start sm:justify-end gap-2 sm:gap-3">
            {regenSuccess && <span className="text-green-400 text-sm">Updated</span>}
            {regenError && <span className="text-red-400 text-sm">{regenError}</span>}
            <button
              className="px-3 sm:px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
              disabled={isRegenerating || !strategy}
              onClick={handleRegenerateExplanation}
            >{isRegenerating ? 'Regenerating…' : 'Regenerate Explanation'}</button>
          </div>
        </div>
        <p className="text-xs sm:text-base text-gray-300 leading-relaxed">{explanation?.plain_english_entry || 'No explanation available.'}</p>
        {explanation?.exit_reason && <p className="mt-3 sm:mt-4 text-xs sm:text-base text-gray-300"><strong>Exit Reason:</strong> {explanation.exit_reason}</p>}
      </div>

      {explanation?.failure_analysis && (
        <div className="bg-red-900/20 border border-red-700/50 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
              <h3 className="text-base sm:text-xl font-semibold text-red-300">AI Post-Mortem Analysis</h3>
              <div className="flex w-full sm:w-auto items-center justify-start sm:justify-end gap-2 sm:gap-3">
                {regenAnalysisSuccess && <span className="text-green-400 text-sm">Updated</span>}
                {regenAnalysisError && <span className="text-red-400 text-sm">{regenAnalysisError}</span>}
                <button
                  className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm rounded bg-red-600 hover:bg-red-500 disabled:opacity-60"
                  disabled={isRegeneratingAnalysis || !explanation}
                  onClick={handleRegenerateFailureAnalysis}
                >{isRegeneratingAnalysis ? 'Regenerating…' : 'Regenerate Analysis'}</button>
              </div>
            </div>
            <p className="text-xs sm:text-base text-red-200/90 leading-relaxed">{explanation.failure_analysis}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-4 sm:gap-y-8">
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

      <div className="bg-gray-800 rounded-lg sm:rounded-xl shadow-lg h-[280px] sm:h-[420px] lg:h-[500px]">
        <TradingViewWidget symbol={position.symbol} timeframe={strategy?.timeframe} />
      </div>
      <div className="bg-gray-800 rounded-lg sm:rounded-xl shadow-lg h-[320px] sm:h-[420px] lg:h-[500px]">
        <AnnotatedChart
          symbol={position.symbol}
          timeframe={strategy?.timeframe}
          side={position.side}
          entryPrice={position.entry_price}
          stopPrice={position.stop_price}
          tpPrice={position.tp_price}
          entryTs={position.entry_ts}
          exitTs={position.exit_ts}
        />
      </div>
    </div>
  );
};

export default PositionDetail;