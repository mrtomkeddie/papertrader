import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { POPULAR_MARKETS, SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { getAiTradeAction } from '../services/geminiService';
import { AiTradeAction, Side, Opportunity } from '../types';
import { SparklesIcon, GlobeIcon, CoinIcon, SpinnerIcon } from '../components/icons/Icons';
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

    // Define optimal trading windows in UTC
    const isForexHours = currentDayUTC >= 1 && currentDayUTC <= 5 && currentHourUTC >= 12 && currentHourUTC < 20;
    const isCryptoHours = currentHourUTC >= 13 && currentHourUTC < 22;
    
    let marketsToScan = [];
    let scannedMarketTypes = [];

    if (isForexHours) {
        marketsToScan.push(...SELECTED_INSTRUMENTS.filter(m => m.category === 'Forex'));
        scannedMarketTypes.push('Forex');
    }
    if (isCryptoHours) {
        marketsToScan.push(...SELECTED_INSTRUMENTS.filter(m => m.category === 'Crypto'));
        scannedMarketTypes.push('Crypto');
    }

    if (marketsToScan.length === 0) {
        setError("No markets are in their optimal trading session. Please try again during the recommended times for the best results.");
        setIsScanning(false);
        return;
    }

    const marketTypesMessage = scannedMarketTypes.join(' & ');
    setMarketsBeingScanned(marketTypesMessage);
    setScanProgress({ current: 0, total: marketsToScan.length });
    
    const baseTimeframe = '1H'; // Initial timeframe for strategy evaluation

    const foundOpportunities: Opportunity[] = [];

    // Process markets sequentially
    for (const market of marketsToScan) {
        try {
            const signals = await getStrategySignals(market.symbol, baseTimeframe);
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
                    suggested_timeframe: baseTimeframe,
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
      <div className="bg-gray-800 p-2 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Forex Card */}
          <div className="bg-gray-900/50 p-2 sm:p-4 rounded-lg sm:rounded-xl flex items-center space-x-3 sm:space-x-4">
            <div className="text-primary-light"><GlobeIcon /></div>
            <div>
              <h4 className="font-bold text-white">Forex Markets</h4>
              <p className="text-xl sm:text-2xl font-bold font-mono text-primary-light tracking-wider">
                {formatUtcHourToLocal(12)} - {formatUtcHourToLocal(20)}
              </p>
              <p className="text-xs text-gray-400">Mon-Fri (London/NY Overlap)</p>
            </div>
          </div>
          {/* Crypto Card */}
          <div className="bg-gray-900/50 p-2 sm:p-4 rounded-lg sm:rounded-xl flex items-center space-x-3 sm:space-x-4">
            <div className="text-primary-light"><CoinIcon /></div>
            <div>
              <h4 className="font-bold text-white">Crypto Markets</h4>
              <p className="text-xl sm:text-2xl font-bold font-mono text-primary-light tracking-wider">
                {formatUtcHourToLocal(13)} - {formatUtcHourToLocal(22)}
              </p>
              <p className="text-xs text-gray-400">Daily (Peak US Volume)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg">
        {isScanning ? (
            <div className="w-full p-10 text-white rounded-lg bg-primary-dark/40 border-2 border-primary-dark/50">
                <div className="flex flex-col items-center space-y-4">
                    <SpinnerIcon />
                    <span className="text-2xl font-semibold text-center">
                        Scanning {marketsBeingScanned}... ({scanProgress.current}/{scanProgress.total})
                    </span>
                    <div className="w-full bg-gray-600 rounded-full h-2.5">
                        <div 
                            className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                            style={{ width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        ) : (
          <button 
            onClick={handleScan} 
            disabled={isScanning}
            className="w-full p-6 sm:p-10 text-white rounded-lg hover:bg-primary-darker/60 bg-primary-dark/40 transition-all duration-300 disabled:bg-gray-700 disabled:cursor-not-allowed text-xl sm:text-2xl font-semibold flex items-center justify-center group border-2 border-primary-dark/50 hover:border-primary-dark"
          >
            <div className="flex flex-col items-center space-y-3 transform group-hover:scale-105 transition-transform duration-200">
              <SparklesIcon />
              <span>Scan Optimal Markets</span>
            </div>
          </button>
        )}
      </div>

      {error && !isScanning && (
        <div className="text-center py-4 text-amber-300 bg-amber-900/20 rounded-md">{error}</div>
      )}
      


      {opportunities.length > 0 && !isScanning && (
        <div className="space-y-4 pt-6">
          <h3 className="text-xl sm:text-2xl font-bold text-white">All Found Opportunities</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {opportunities.map(op => (
              <OpportunityCard key={op.symbol} opportunity={op} onAnalyze={handleAnalyze} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface OpportunityCardProps {
  opportunity: Opportunity;
  onAnalyze: (opportunity: Opportunity) => void;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ opportunity, onAnalyze }) => {
  const trade = opportunity.action.trade;
  if (!trade) return null;

  return (
    <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-3">
          <h4 className="text-lg sm:text-xl font-bold text-white">{opportunity.symbol}</h4>
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${trade.side === Side.LONG ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {trade.side}
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-1"><span className="font-semibold">Strategy:</span> {trade.strategy_type}</p>
        <p className="text-sm text-gray-300 mb-2"><span className="font-semibold text-gray-400">Suggested Timeframe:</span> <span className="font-bold text-primary-light">{trade.suggested_timeframe}</span></p>
        <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">
          {trade.reason}
        </p>
      </div>
      <button 
        onClick={() => onAnalyze(opportunity)}
        className="mt-3 sm:mt-4 w-full px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
      >
        Analyze on Dashboard
      </button>
    </div>
  );
};



export default Scanner;