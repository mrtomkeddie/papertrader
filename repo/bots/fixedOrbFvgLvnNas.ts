import { Bot } from './types';
import { evaluateFixedStrategy } from '../strategies/fixedOrbFvgLvn';
import { StrategySignal } from '../types';

function getNyOpenUtc(date: Date): Date {
  const year = date.getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 1));
  const firstSundayInMarch = 7 - march.getUTCDay();
  const secondSundayInMarch = 1 + firstSundayInMarch + 7;
  const dstStart = new Date(Date.UTC(year, 2, secondSundayInMarch));
  const nov = new Date(Date.UTC(year, 10, 1));
  const firstSundayInNov = 7 - nov.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, 1 + firstSundayInNov));
  const isDst = date >= dstStart && date < dstEnd;
  const openHour = isDst ? 13 : 14;
  const openMinute = 30;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), openHour, openMinute, 0, 0));
}

function inWindow(now: Date): boolean {
  const dow = now.getUTCDay();
  if (dow < 1 || dow > 5) return false;
  const open = getNyOpenUtc(now);
  const orEnd = new Date(open.getTime() + 15 * 60_000);
  const windowEnd = new Date(open.getTime() + 3 * 60 * 60_000);
  return now >= orEnd && now <= windowEnd;
}

export const fixedOrbFvgLvnNasBot: Bot = {
  id: 'fixed-orb-fvg-lvn-nas',
  isEnabled: () => true,
  isWindowOpen: (now: Date) => inWindow(now),
  scan: async (): Promise<StrategySignal[]> => {
    const s = await evaluateFixedStrategy('OANDA:NAS100_USD');
    return s ? [s] : [];
  },
  selectSignals: (candidates: StrategySignal[]) => {
    return candidates.map(s => ({
      side: s.side,
      entry_price: s.entry,
      stop_price: s.stop,
      tp_price: s.tp,
      reason: s.reason,
      strategy_type: 'FIXED ORB + FVG + LVN',
      slippage_bps: 5,
      fee_bps: 10,
      risk_reward_ratio: s.rrr ?? 0,
      suggested_timeframe: '15m',
    }));
  },
};