import { StrategySignal, Side, OhlcData } from '../types'
import { fetchOHLCV } from '../services/dataService'

const SYMBOL = 'OANDA:XAUUSD'
const TF = '5m'

type DayState = { usedSwingLow?: number; zoneLow?: number; zoneHigh?: number; sweepTime?: number; entryTaken?: boolean }
const dailyState: Record<string, DayState> = {}

function londonParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  const weekday = get('weekday')
  const day = get('day')
  const month = get('month')
  const year = get('year')
  const dateStr = `${year}-${month}-${day}`
  return { hour, minute, weekday, dateStr }
}

function inLondonWindow(d: Date) {
  const { hour, minute, weekday } = londonParts(d)
  const wk = weekday.toLowerCase()
  const isWeekday = wk.startsWith('mon') || wk.startsWith('tue') || wk.startsWith('wed') || wk.startsWith('thu') || wk.startsWith('fri')
  const mins = hour * 60 + minute
  return isWeekday && mins >= (6 * 60 + 45) && mins <= (9 * 60)
}

function isSwingLow(ohlcv: OhlcData[], i: number) {
  if (i < 2 || i > ohlcv.length - 3) return false
  const low = ohlcv[i].low
  return (
    low < Math.min(ohlcv[i - 1].low, ohlcv[i - 2].low) &&
    low < Math.min(ohlcv[i + 1].low, ohlcv[i + 2].low)
  )
}

function mostRecentSwingLowIndex(ohlcv: OhlcData[]) {
  for (let i = ohlcv.length - 3; i >= 2; i--) {
    if (isSwingLow(ohlcv, i)) return i
  }
  return -1
}

function impulseAboveSweep(ohlcv: OhlcData[], fromIdx: number, sweepHigh: number) {
  for (let i = fromIdx + 1; i < ohlcv.length; i++) {
    const c = ohlcv[i]
    const bull = c.close > c.open
    const range = c.high - c.low
    const strong = (c.close - c.open) >= 0.5 * range
    const closesAbove = c.close > sweepHigh
    if (bull && strong && closesAbove) {
      const prev = ohlcv[i - 1]
      if (prev && prev.close < prev.open) {
        return { zoneLow: prev.low, zoneHigh: prev.high, impulseIdx: i }
      }
    }
  }
  return null
}

export async function evaluateLondonLiquiditySweep(symbol: string): Promise<StrategySignal | null> {
  const now = new Date()
  if (symbol !== SYMBOL) return null
  if (!inLondonWindow(now)) return null

  const ohlcv = await fetchOHLCV(SYMBOL, TF, 400)
  if (ohlcv.length < 50) return null

  const { dateStr } = londonParts(now)
  const state = (dailyState[dateStr] ||= {})

  if (state.entryTaken) return null

  let zoneLow = state.zoneLow
  let zoneHigh = state.zoneHigh

  if (zoneLow == null || zoneHigh == null) {
    const swingIdx = mostRecentSwingLowIndex(ohlcv)
    if (swingIdx < 0) return null
    const swingLowPrice = ohlcv[swingIdx].low
    if (state.usedSwingLow != null && Math.abs(state.usedSwingLow - swingLowPrice) < 1e-6) return null
    let sweepIdx: number | null = null
    for (let j = swingIdx + 1; j < ohlcv.length; j++) {
      const c = ohlcv[j]
      const t = new Date(c.time * 1000)
      if (!inLondonWindow(t)) continue
      const below = swingLowPrice - c.low
      const within = below >= 0.2 && below <= 0.5
      const reject = c.close > swingLowPrice
      if (within && reject) { sweepIdx = j; break }
    }
    if (sweepIdx == null) return null
    const sweepHigh = ohlcv[sweepIdx].high
    const imp = impulseAboveSweep(ohlcv, sweepIdx, sweepHigh)
    if (!imp) return null
    zoneLow = imp.zoneLow
    zoneHigh = imp.zoneHigh
    state.zoneLow = zoneLow
    state.zoneHigh = zoneHigh
    state.sweepTime = ohlcv[sweepIdx].time * 1000
    state.usedSwingLow = swingLowPrice
  }

  const movedAway = ohlcv.some(c => c.time * 1000 >= (state.sweepTime ?? 0) && c.close > (zoneHigh ?? Infinity))

  const latest = ohlcv[ohlcv.length - 1]
  const latestTime = new Date(latest.time * 1000)
  if (!inLondonWindow(latestTime)) return null
  const touchesZone = (latest.low <= (zoneHigh as number) && latest.high >= (zoneLow as number)) || (latest.low <= (zoneLow as number))
  const closesBull = latest.close > latest.open
  if (!movedAway || !touchesZone || !closesBull) return null

  const entry = latest.close
  const stop = (zoneLow as number) - 1.0
  const r = Math.abs(entry - stop)
  if (r <= 0) return null
  const tp = entry + 3 * r
  const reason = `SweepLow=${state.usedSwingLow?.toFixed(2)} | Zone=[${zoneLow?.toFixed(2)}-${zoneHigh?.toFixed(2)}] | EntryOnRevisit | Stop=${stop.toFixed(2)}`
  const signal: StrategySignal = { side: Side.LONG, entry, stop, tp, score: 1.0, reason, rrr: Math.abs(tp - entry) / r, strategy: 'London Liquidity Sweep (Gold)', bar_time: latest.time * 1000 }
  state.entryTaken = true
  return signal
}