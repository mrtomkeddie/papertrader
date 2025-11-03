import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { POPULAR_MARKETS, SELECTED_INSTRUMENTS, SELECTED_METHODS, TIMEFRAME_BY_SYMBOL } from '../constants';
import { getAiTradeAction } from '../services/geminiService';
import { getStrategySignals } from '../services/strategyService';
import { AiTradeAction, Side, Opportunity } from '../types';
import { SparklesIcon, GlobeIcon, SpinnerIcon } from '../components/icons/Icons';
import { useDatabase } from '../hooks/useDatabase';
import { Strategy } from '../types';

const Scanner: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  // Remove rankedOpportunities state as ranking is decommissioned
  const [error, setError] = useState<string | null>(null);
  const [marketsBeingScanned, setMarketsBeingScanned] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const navigate = useNavigate();

  // Fetch strategies, as getStrategies is now async and part of useDatabase
  const { data: strategies, loading: strategiesLoading } = useDatabase<Strategy[]>('strategies');


  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setOpportunities([]);
    // Remove setRankedOpportunities([])
    setMarketsBeingScanned('');
    setScanProgress({ current: 0, total: 0 });

    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentDayUTC = now.getUTCDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

    // Forex-only optimal window in UTC
    const isForexHours = currentDayUTC >= 1 && currentDayUTC <= 5 && currentHourUTC >= 12 && currentHourUTC < 20;
    
    let marketsToScan = [] as typeof SELECTED_INSTRUMENTS;
    let scannedMarketTypes: string[] = [];

    if (isForexHours) {
        marketsToScan.push(...SELECTED_INSTRUMENTS);
        scannedMarketTypes.push('Selected');
    }

    if (marketsToScan.length === 0) {
        setError("No markets are in their optimal trading session. Please try again during the recommended times for the best results.");
        setIsScanning(false);
        return;
    }

    const marketTypesMessage = scannedMarketTypes.join(' & ');
    setMarketsBeingScanned(marketTypesMessage);
    setScanProgress({ current: 0, total: marketsToScan.length });
    
    const foundOpportunities: Opportunity[] = [];

    // Process markets sequentially
    for (const market of marketsToScan) {
        try {
            const tf = TIMEFRAME_BY_SYMBOL[market.symbol] || '1H';
            const signals = await getStrategySignals(market.symbol, tf);
            for (const signal of signals) {
                if (!SELECTED_METHODS.includes(signal.strategy)) continue;
                const trade = {
                    side: signal.side,
                    entry_price: signal.entry,
                    stop_price: signal.stop,
                    tp_price: signal.tp,
                    reason: signal.reason,
                    strategy_type: signal.strategy,
                    slippage_bps: 5,
                    fee_bps: 10,
                    risk_reward_ratio: signal.rrr,
                    suggested_timeframe: tf,
                };
                foundOpportunities.push({ symbol: market.symbol, action: { action: 'TRADE', trade } });
            }
        } catch (error: any) {
            console.error(`Error scanning ${market.symbol}:`, error);
            // Continue scanning other markets
        } finally {
            setScanProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
    }

    // Sort opportunities by RRR descending
    foundOpportunities.sort((a, b) => (b.action.trade?.risk_reward_ratio || 0) - (a.action.trade?.risk_reward_ratio || 0));

    if (foundOpportunities.length === 0) {
        setError(`Scan of ${marketTypesMessage} complete. No high-probability setups were found at this time.`);
    } else {
        setOpportunities(foundOpportunities);
        // Ranking removed: show all opportunities; no top 3 selection
    }
    setIsScanning(false);
  };

  const handleAnalyze = (opportunity: Opportunity) => {
    const suggestedTimeframe = opportunity.action.trade?.suggested_timeframe || '1D';
    navigate('/', { state: { symbol: opportunity.symbol, timeframe: suggestedTimeframe } });
  };
  
  const formatUtcHourToLocal = (hour: number): string => {
      const date = new Date();
      date.setUTCHours(hour, 0, 0, 0);
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  };
  
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">Smart Market Scanner</h2>
      </div>
      <div className="card-premium p-2 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4">
            <div>
                <h3 className="text-lg font-semibold text-primary-light">Optimal Trading Windows</h3>
                <p className="text-gray-400 max-w-4xl mt-1">
                  Times are shown in your local timezone ({timezone}).
                </p>
            </div>
             <div className="text-left sm:text-right flex-shrink-0 mt-3 sm:mt-0">
                <p className="text-lg font-mono text-gray-200">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                <p className="text-sm font-mono text-gray-400">
                    {currentTime.toUTCString().match(/(\d{2}:\d{2}:\d{2})/)?.[0]} (UTC)
                </p>
            </div>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {/* Trading Window Card */}
          <div className="card-premium p-2 sm:p-4 rounded-lg sm:rounded-xl flex items-center space-x-3 sm:space-x-4">
            <div className="text-primary-light"><GlobeIcon /></div>
            <div>
              <h4 className="font-bold text.white">Active Markets</h4>
              <p className="text-xl sm:text-2xl font-bold font-mono text-primary-light tracking-wider">
                {formatUtcHourToLocal(12)} - {formatUtcHourToLocal(20)}
              </p>
              <p className="text-xs text-gray-400">Mon-Fri (London/NY Overlap)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        {isScanning && (
          <div className="flex items-center space-x-2 text-gray-300">
            <SpinnerIcon />
            <span>Scanning {marketsBeingScanned}...</span>
          </div>
        )}
        {error && (
          <div className="text-red-400">{error}</div>
        )}
        {opportunities.map((op, idx) => (
          <OpportunityCard key={`${op.symbol}-${idx}`} opportunity={op} onAnalyze={handleAnalyze} />
        ))}
      </div>
    </div>
  );
};

interface OpportunityCardProps {
  opportunity: Opportunity;
  onAnalyze: (opportunity: Opportunity) => void;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ opportunity, onAnalyze }) => {
  const trade = opportunity.action.trade!;
  const isLong = trade.side === Side.LONG;
  const rrr = trade.risk_reward_ratio?.toFixed(2);
  return (
    <div className="card-premium rounded-lg shadow p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-white font-bold">{opportunity.symbol}</div>
          <div className="text-gray-400 text-sm">{trade.strategy_type} • TF {trade.suggested_timeframe}</div>
        </div>
        <button
          className="w-full sm:w-auto px-3 py-1 btn-accent"
          onClick={() => onAnalyze(opportunity)}
        >Analyze</button>
      </div>
      <div className="mt-2 text-sm text-gray-300">
        <div>Side: <span className={isLong ? 'text-accent-green' : 'text-red-400'}>{isLong ? 'LONG' : 'SHORT'}</span></div>
        <div>Entry: {trade.entry_price.toFixed(2)} • Stop: {trade.stop_price.toFixed(2)} • TP: {trade.tp_price.toFixed(2)}</div>
        <div>RRR: {rrr}</div>
        <div className="text-xs text-gray-400 mt-1">{trade.reason}</div>
      </div>
    </div>
  );
};

export default Scanner;