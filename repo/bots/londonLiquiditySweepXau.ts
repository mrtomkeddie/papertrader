import { Bot } from './types'
import { StrategySignal } from '../types'
import { evaluateLondonLiquiditySweep } from '../strategies/londonLiquiditySweepXau'

function londonParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  const weekday = get('weekday')
  const wk = weekday.toLowerCase()
  const isWeekday = wk.startsWith('mon') || wk.startsWith('tue') || wk.startsWith('wed') || wk.startsWith('thu') || wk.startsWith('fri')
  const mins = hour * 60 + minute
  const inside = isWeekday && mins >= (6 * 60 + 45) && mins <= (9 * 60)
  return { inside }
}

export const londonLiquiditySweepXauBot: Bot = {
  id: 'london-liquidity-xau',
  isEnabled() {
    const list = (process.env.VITE_ENABLED_BOTS || process.env.AUTOPILOT_ENABLED_BOTS || '').toLowerCase()
    return list ? list.split(',').map(s => s.trim()).includes('london-liquidity-xau') : true
  },
  isWindowOpen(now: Date) {
    return londonParts(now).inside
  },
  async scan(): Promise<StrategySignal[]> {
    const s = await evaluateLondonLiquiditySweep('OANDA:XAUUSD')
    return s ? [s] : []
  },
  selectSignals(candidates: StrategySignal[]) {
    return candidates.map(s => ({
      side: s.side,
      entry_price: s.entry,
      stop_price: s.stop,
      tp_price: s.tp,
      reason: s.reason,
      strategy_type: 'London Liquidity Sweep (Gold)',
      slippage_bps: 5,
      fee_bps: 10,
      risk_reward_ratio: s.rrr ?? 0,
      suggested_timeframe: '5m',
    }))
  }
}