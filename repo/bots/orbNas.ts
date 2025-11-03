import { Bot } from './types';
import { fetchOHLCV } from '../services/dataService';
import { evaluateORB } from '../strategies/orb';
import { TIMEFRAME_BY_SYMBOL } from '../constants';

const SYMBOL = 'OANDA:NAS100_USD';
const TF = TIMEFRAME_BY_SYMBOL[SYMBOL] || '15m';

export const orbBotNas: Bot = {
  id: 'orb',
  isEnabled() {
    const list = (process.env.VITE_ENABLED_BOTS || process.env.AUTOPILOT_ENABLED_BOTS || '').toLowerCase();
    return list ? list.split(',').map(s => s.trim()).includes('orb') : true;
  },
  isWindowOpen(now: Date) {
    const h = now.getUTCHours();
    const d = now.getUTCDay();
    return d >= 1 && d <= 5 && h >= 12 && h < 20 && (h > 12 || (h === 12 && now.getUTCMinutes() >= 15));
  },
  async scan() {
    const ohlcv = await fetchOHLCV(SYMBOL, TF, 150);
    const sig = evaluateORB(ohlcv);
    return sig ? [{ ...sig, strategy: 'ORB' } as any] : [];
  },
  selectSignals(candidates) {
    const minRR = 1.0;
    const chosen = candidates.filter(s => (s.rrr ?? 0) >= minRR);
    return chosen.map(s => ({
      side: s.side,
      entry_price: s.entry,
      stop_price: s.stop,
      tp_price: s.tp,
      reason: s.reason,
      strategy_type: 'ORB',
      slippage_bps: 5,
      fee_bps: 10,
      risk_reward_ratio: s.rrr,
      suggested_timeframe: TF,
    }));
  }
};