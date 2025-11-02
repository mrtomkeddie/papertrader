import React, { useState, useEffect } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import * as db from '../services/database'; // Now uses Firestore-backed functions
import { Strategy, StopLogic } from '../types';

const Strategies: React.FC = () => {
  const { data: strategies, loading, error } = useDatabase<Strategy[]>('strategies');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  const openModal = (strategy: Strategy | null = null) => {
    setEditingStrategy(strategy);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStrategy(null);
  };

  const handleSave = async (strategy: Strategy) => {
    try {
      if (strategy.id && strategies?.some(s => s.id === strategy.id)) {
        await db.updateStrategy(strategy);
      } else {
        await db.addStrategy(strategy);
      }
      closeModal();
    } catch (err: any) {
      console.error("Failed to save strategy:", err);
      alert(`Failed to save strategy: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if(window.confirm("Are you sure you want to delete this strategy?")) {
        try {
            await db.deleteStrategy(id);
        } catch (err: any) {
            console.error("Failed to delete strategy:", err);
            alert(`Failed to delete strategy: ${err.message}`);
        }
    }
  }

  if (loading) {
    return <div className="text-center text-xl text-primary-light">Loading strategies...</div>;
  }

  if (error) {
    return <div className="text-center text-xl text-red-400">Error loading strategies: {error}</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl sm:text-3xl font-bold text-white">Webhook Strategy Profiles</h2>
        <button onClick={() => openModal()} className="px-3 py-2 sm:px-4 sm:py-2 bg-primary-dark text-white rounded-md hover:bg-primary-darker transition text-center leading-tight">
          Add Profile
        </button>
      </div>

      <p className="text-gray-400 text-sm sm:text-base max-w-3xl">
          These profiles define the rules for trades initiated by **TradingView Webhooks**. When a webhook alert is received for a symbol, the system will use the corresponding enabled profile here to manage the trade's risk and execution parameters.
          <br/><br/>
          For AI-driven trades on the Dashboard, risk is set directly, and the AI determines all other parameters.
      </p>

      <div className="card-premium p-2 sm:p-6 rounded-lg sm:rounded-xl shadow-lg overflow-x-auto">
        <table className="min-w-full table-premium">
          <thead>
            <tr>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Symbol</th>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Risk (£)</th>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">TP (R)</th>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Stop Logic</th>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Enabled</th>
              <th className="px-2 py-2 sm:px-4 sm:py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {strategies?.map(s => (
              <tr key={s.id}>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-white">{s.name}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-300">{s.symbol}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-300">{s.risk_per_trade_gbp}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-300">{s.take_profit_R}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-300">{s.stop_logic}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${s.enabled ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {s.enabled ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-2 py-2 sm:px-4 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium space-x-2">
                  <button onClick={() => openModal(s)} className="text-primary-light hover:text-primary">Edit</button>
                  <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-300">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && <StrategyModal strategy={editingStrategy} onSave={handleSave} onClose={closeModal} />}
    </div>
  );
};


const StrategyModal: React.FC<{ strategy: Strategy | null, onSave: (strategy: Strategy) => void, onClose: () => void }> = ({ strategy, onSave, onClose }) => {
    const [formState, setFormState] = useState<Strategy>(strategy || {
        id: '', name: '', symbol: '', timeframe: '1D', risk_per_trade_gbp: 5, stop_logic: StopLogic.ATR,
        atr_mult: 1.5, take_profit_R: 2, slippage_bps: 10, fee_bps: 5, enabled: true
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormState(prev => ({ ...prev, [name]: checked }));
        } else {
             const isNumeric = ['risk_per_trade_gbp', 'atr_mult', 'take_profit_R', 'slippage_bps', 'fee_bps'].includes(name);
             setFormState(prev => ({ ...prev, [name]: isNumeric ? Number(value) : value }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formState);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="card-premium rounded-lg sm:rounded-xl shadow-xl p-4 sm:p-8 w-full max-w-md sm:max-w-lg">
                <h3 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">{strategy ? 'Edit' : 'Add'} Webhook Profile</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <InputField label="Profile Name" name="name" value={formState.name} onChange={handleChange} />
                        <InputField label="Symbol Match" name="symbol" value={formState.symbol} onChange={handleChange} placeholder="e.g., AAPL" />
                        <InputField label="Timeframe" name="timeframe" value={formState.timeframe} onChange={handleChange} placeholder="e.g., 5m, 1H, 1D" />
                        <InputField label="Risk per Trade (£)" name="risk_per_trade_gbp" type="number" value={formState.risk_per_trade_gbp} onChange={handleChange} />
                        <div>
                           <label className="block text-sm font-medium text-gray-300 mb-1">Stop Logic</label>
                           <select name="stop_logic" value={formState.stop_logic} onChange={handleChange} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-primary focus:border-primary text-white h-10 px-3">
                                <option value={StopLogic.ATR}>ATR</option>
                                <option value={StopLogic.SWING}>SWING</option>
                           </select>
                        </div>
                        <InputField label="ATR Multiplier" name="atr_mult" type="number" value={formState.atr_mult} onChange={handleChange} step="0.1" />
                        <InputField label="Take Profit (R)" name="take_profit_R" type="number" value={formState.take_profit_R} onChange={handleChange} step="0.1" />
                        <InputField label="Slippage (bps)" name="slippage_bps" type="number" value={formState.slippage_bps} onChange={handleChange} />
                        <InputField label="Fee (bps)" name="fee_bps" type="number" value={formState.fee_bps} onChange={handleChange} />
                        <div className="flex items-center space-x-3 pt-4 sm:pt-6">
                            <input type="checkbox" id="enabled" name="enabled" checked={formState.enabled} onChange={handleChange} className="h-4 w-4 rounded border-gray-400 text-primary focus:ring-primary" />
                            <label htmlFor="enabled" className="text-sm text-gray-300">Enabled for Webhooks</label>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4 sm:pt-6">
                        <button type="button" onClick={onClose} className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-600 rounded-md hover:bg-gray-500 text-center leading-tight">Cancel</button>
                        <button type="submit" className="px-3 py-2 sm:px-4 sm:py-2 bg-primary-dark rounded-md hover:bg-primary-darker text-center leading-tight">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => (
    <div>
        <label htmlFor={props.name} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <input {...props} id={props.name} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-primary focus:border-primary text-white h-10 px-3" />
    </div>
);

export default Strategies;