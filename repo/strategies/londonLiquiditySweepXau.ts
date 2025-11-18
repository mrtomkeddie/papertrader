import { StrategySignal, Side, OhlcData } from '../types'
import { fetchOHLCV } from '../services/dataService'

const SYMBOL = 'OANDA:XAUUSD'
const TF = '5m'
const SWEEP_MIN = 0.10
const SWEEP_MAX = 1.00
const TAP_N_CANDLES = 15

type DayState = { usedSwingLow?: number; zoneLow?: number; zoneHigh?: number; sweepTime?: number; zoneCreatedIdx?: number }
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

function computeAtr14(ohlcv: OhlcData[]): number[] {
  const tr: number[] = []
  for (let i = 0; i < ohlcv.length; i++) {
    if (i === 0) tr.push(ohlcv[i].high - ohlcv[i].low)
    else {
      const tr1 = ohlcv[i].high - ohlcv[i].low
      const tr2 = Math.abs(ohlcv[i].high - ohlcv[i-1].close)
      const tr3 = Math.abs(ohlcv[i].low - ohlcv[i-1].close)
      tr.push(Math.max(tr1, tr2, tr3))
    }
  }
  const period = 14
  const atr: number[] = []
  if (tr.length < period) return atr
  let sum = tr.slice(0, period).reduce((a,v) => a+v, 0)
  atr.push(...Array(period - 1).fill(NaN), sum / period)
  for (let i = period; i < tr.length; i++) {
    const current = (atr[i-1] * (period - 1) + tr[i]) / period
    atr.push(current)
  }
  return atr
}

function impulseAboveSweep(ohlcv: OhlcData[], fromIdx: number, sweepHigh: number, atr: number[]) {
  for (let i = fromIdx + 1; i < ohlcv.length; i++) {
    const c = ohlcv[i]
    const bull = c.close > c.open
    const range = c.high - c.low
    const body = c.close - c.open
    const closesAbove = c.close > sweepHigh
    const bodyStrong = body >= 0.40 * range
    const atrOk = (() => {
      const a = atr[i] ?? atr[atr.length - 1]
      return Number.isFinite(a) && range >= 1.2 * a
    })()
    const passes = bull && (closesAbove || bodyStrong || atrOk)
    if (passes) {
      const prev = ohlcv[i - 1]
      if (prev && prev.close < prev.open) {
        return { zoneLow: prev.low, zoneHigh: prev.high, impulseIdx: i }
      }
    }
  }
  return null
}

export async function evaluateLondonLiquiditySweepDiag(symbol: string): Promise<{ signal: StrategySignal | null; logs: string[] }> {
  const now = new Date()
  const logs: string[] = []
  if (symbol !== SYMBOL) return { signal: null, logs: ['skip: wrong symbol'] }
  if (!inLondonWindow(now)) return { signal: null, logs: ['skip: window closed'] }

  const ohlcv = await fetchOHLCV(SYMBOL, TF, 400)
  if (ohlcv.length < 50) return { signal: null, logs: ['skip: insufficient data'] }

  const { dateStr } = londonParts(now)
  const state = (dailyState[dateStr] ||= {})

  logs.push('info: evaluating london-liquidity-xau')

  let zoneLow = state.zoneLow
  let zoneHigh = state.zoneHigh

  if (zoneLow == null || zoneHigh == null) {
    const swingIdx = mostRecentSwingLowIndex(ohlcv)
    if (swingIdx < 0) { logs.push('skip: no swing low'); return { signal: null, logs } }
    const swingLowPrice = ohlcv[swingIdx].low
    if (state.usedSwingLow != null && Math.abs(state.usedSwingLow - swingLowPrice) < 1e-6) { logs.push('skip: swing low already used today'); return { signal: null, logs } }
    let sweepIdx: number | null = null
    for (let j = swingIdx + 1; j < ohlcv.length; j++) {
      const c = ohlcv[j]
      const t = new Date(c.time * 1000)
      if (!inLondonWindow(t)) continue
      const below = swingLowPrice - c.low
      const within = below >= SWEEP_MIN && below <= SWEEP_MAX
      const reject = c.close > swingLowPrice
      logs.push(`debug: sweep check @${j} dist=${below.toFixed(2)} within=${within} reject=${reject}`)
      if (within && reject) { sweepIdx = j; logs.push(`info: sweep detected idx=${j} dist=${below.toFixed(2)}`); break }
    }
    if (sweepIdx == null) { logs.push('skip: no sweep inside window'); return { signal: null, logs } }
    const sweepHigh = ohlcv[sweepIdx].high
    const atr = computeAtr14(ohlcv)
    const imp = impulseAboveSweep(ohlcv, sweepIdx, sweepHigh, atr)
    if (!imp) { logs.push('skip: no displacement after sweep'); return { signal: null, logs } }
    zoneLow = imp.zoneLow
    zoneHigh = imp.zoneHigh
    state.zoneLow = zoneLow
    state.zoneHigh = zoneHigh
    state.sweepTime = ohlcv[sweepIdx].time * 1000
    state.usedSwingLow = swingLowPrice
    state.zoneCreatedIdx = imp.impulseIdx
    logs.push(`info: zone set low=${zoneLow.toFixed(2)} high=${zoneHigh.toFixed(2)} at idx=${imp.impulseIdx}`)
  }

  const movedAway = ohlcv.some(c => c.time * 1000 >= (state.sweepTime ?? 0) && c.close > (zoneHigh ?? Infinity))
  if (!movedAway) logs.push('debug: not moved away above zoneHigh yet')

  const latest = ohlcv[ohlcv.length - 1]
  const latestTime = new Date(latest.time * 1000)
  if (!inLondonWindow(latestTime)) { logs.push('skip: latest outside window'); return { signal: null, logs } }
  const touchesZone = (latest.low <= (zoneHigh as number) && latest.high >= (zoneLow as number)) || (latest.low <= (zoneLow as number))
  const closesBull = latest.close > latest.open
  if (!touchesZone) logs.push('skip: no zone touch on latest')
  if (!closesBull) logs.push('skip: latest not bullish')

  // Path A: move away then re-entry
  if (movedAway && touchesZone && closesBull) {
    const entry = latest.close
    const stop = (zoneLow as number) - 1.0
    const r = Math.abs(entry - stop)
    if (r <= 0) { logs.push('skip: invalid R calc'); return { signal: null, logs } }
    const tp = entry + 3 * r
    const reason = `EntryOnRevisit | SweepLow=${state.usedSwingLow?.toFixed(2)} Zone=[${zoneLow?.toFixed(2)}-${zoneHigh?.toFixed(2)}] Stop=${stop.toFixed(2)}`
    const signal: StrategySignal = { side: Side.LONG, entry, stop, tp, score: 1.0, reason, rrr: Math.abs(tp - entry) / r, strategy: 'London Liquidity Sweep (Gold)', bar_time: latest.time * 1000 }
    logs.push('info: entry signal (revisit)')
    return { signal, logs }
  }

  // Path B: tap-and-go within N candles after zone creation
  const zIdx = state.zoneCreatedIdx ?? -1
  if (zIdx >= 0) {
    const latestIdx = ohlcv.length - 1
    const barsSinceZone = latestIdx - zIdx
    if (barsSinceZone >= 1 && barsSinceZone <= TAP_N_CANDLES) {
      const tapOverlap = touchesZone
      if (tapOverlap && closesBull) {
        const entry = latest.close
        const stop = (zoneLow as number) - 1.0
        const r = Math.abs(entry - stop)
        if (r <= 0) { logs.push('skip: invalid R calc (tap)'); return { signal: null, logs } }
        const tp = entry + 3 * r
        const reason = `EntryTapAndGo | barsSinceZone=${barsSinceZone} Zone=[${zoneLow?.toFixed(2)}-${zoneHigh?.toFixed(2)}] Stop=${stop.toFixed(2)}`
        const signal: StrategySignal = { side: Side.LONG, entry, stop, tp, score: 1.0, reason, rrr: Math.abs(tp - entry) / r, strategy: 'London Liquidity Sweep (Gold)', bar_time: latest.time * 1000 }
        logs.push('info: entry signal (tap-and-go)')
        return { signal, logs }
      } else {
        logs.push(`skip: tap window barsSinceZone=${barsSinceZone} overlap=${tapOverlap} bull=${closesBull}`)
      }
    } else {
      logs.push(`debug: tap window expired barsSinceZone=${barsSinceZone}`)
    }
  } else {
    logs.push('debug: zoneCreatedIdx unknown')
  }

  return { signal: null, logs }
}

export async function evaluateLondonLiquiditySweep(symbol: string): Promise<StrategySignal | null> {
  const { signal } = await evaluateLondonLiquiditySweepDiag(symbol)
  return signal
}