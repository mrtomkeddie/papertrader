import { Bot } from './types';
import { fetchOHLCV } from '../services/dataService';
import { evaluateVWAPReversion } from '../strategies/vwapReversion';
import { TIMEFRAME_BY_SYMBOL } from '../constants';

const SYMBOL = 'OANDA:XAUUSD';
const TF = TIMEFRAME_BY_SYMBOL[SYMBOL] || '15m';

export const vwapBot: Bot = {
  id: 'vwapReversion',
  isEnabled() {
    const list = (process.env.VITE_ENABLED_BOTS || process.env.AUTOPILOT_ENABLED_BOTS || '').toLowerCase();
    return list ? list.split(',').map(s => s.trim()).includes('vwapreversion') : true;
  },
  isWindowOpen(now: Date) {
    const h = now.getUTCHours();
    const d = now.getUTCDay();
    return d >= 1 && d <= 5 && h >= 14 && h < 17;
  },
  async scan() {
    const ohlcv = await fetchOHLCV(SYMBOL, TF, 150);
    const sig = evaluateVWAPReversion(ohlcv);
    return sig ? [{ ...sig, strategy: 'VWAP Reversion' } as any] : [];
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
      strategy_type: 'VWAP Reversion',
      slippage_bps: 5,
      fee_bps: 10,
      risk_reward_ratio: s.rrr,
      suggested_timeframe: TF,
    }));
  }
};