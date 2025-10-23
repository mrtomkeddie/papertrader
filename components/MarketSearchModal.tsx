import React, { useState, useMemo } from 'react';
import { POPULAR_MARKETS } from '../constants';
import { SearchIcon } from './icons/Icons';

interface MarketSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
}

type Market = (typeof POPULAR_MARKETS)[number];

const MarketSearchModal: React.FC<MarketSearchModalProps> = ({ isOpen, onSelectSymbol, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const categorizedMarkets = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    
    const filteredMarkets = searchTerm
      ? POPULAR_MARKETS.filter(
          market =>
            market.symbol.toLowerCase().includes(lowercasedFilter) ||
            market.description.toLowerCase().includes(lowercasedFilter)
        )
      : POPULAR_MARKETS;

    const categorized: Record<string, Market[]> = {};
    for (const market of filteredMarkets) {
      const category = market.category;
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(market);
    }
    // Return the categorized data in a render-friendly format
    return Object.entries(categorized);
  }, [searchTerm]);

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <div className="p-4 border-b border-gray-700">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <SearchIcon />
                </div>
                <input
                  type="text"
                  placeholder="Search for a market (e.g., TSLA, BTC, EURUSD)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-700 p-2 pl-10 rounded-md text-white border border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                  autoFocus
                />
            </div>
        </div>
        <div className="p-4 overflow-y-auto">
            {categorizedMarkets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {categorizedMarkets.map(([category, markets]) => (
                    <React.Fragment key={category}>
                        <h3 className="text-lg font-semibold text-emerald-400 mt-4 mb-2 first:mt-0 col-span-full">{category}</h3>
                        {markets.map(market => (
                            <button
                                key={market.symbol}
                                onClick={() => onSelectSymbol(market.symbol)}
                                className="text-left p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition"
                            >
                                <p className="font-bold text-white">{market.symbol}</p>
                                <p className="text-sm text-gray-400">{market.description}</p>
                            </button>
                        ))}
                    </React.Fragment>
                ))}
              </div>
            ) : (
                <p className="text-gray-400 text-center py-8">No markets found for "{searchTerm}".</p>
            )}
        </div>
        <div className="p-4 border-t border-gray-700 text-right">
            <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

export default MarketSearchModal;
