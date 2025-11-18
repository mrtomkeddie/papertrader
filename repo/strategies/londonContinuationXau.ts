import { StrategySignal, Side, OhlcData } from '../types'
import { fetchOHLCV } from '../services/dataService'

const SYMBOL = 'OANDA:XAUUSD'
const TF = '5m'
const MIN_IMPULSE_USD = 10.0
const IMPULSE_ATR_MULT = 2.0
const PB_LOW_RATIO = 0.38
const PB_HIGH_RATIO = 0.62
const BREAKOUT_BAND = 2.0

type DayState = {
  impulseLow?: number
  impulseHigh?: number
  impulseMid?: number
  anchorSet?: boolean
  lastZoneTouchIdx?: number
  lastBreakoutTouchIdx?: number
}

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

function inContinuationWindow(d: Date) {
  const { hour, minute, weekday } = londonParts(d)
  const wk = weekday.toLowerCase()
  const isWeekday = wk.startsWith('mon') || wk.startsWith('tue') || wk.startsWith('wed') || wk.startsWith('thu') || wk.startsWith('fri')
  const mins = hour * 60 + minute
  return isWeekday && mins >= (8 * 60 + 30) && mins <= (11 * 60)
}

function inAnchorWindow(d: Date) {
  const { hour, minute, weekday } = londonParts(d)
  const wk = weekday.toLowerCase()
  const isWeekday = wk.startsWith('mon') || wk.startsWith('tue') || wk.startsWith('wed') || wk.startsWith('thu') || wk.startsWith('fri')
  const mins = hour * 60 + minute
  return isWeekday && mins >= (6 * 60 + 45) && mins <= (9 * 60 + 30)
}

function isSwingLow(ohlcv: OhlcData[], i: number) {
  if (i < 2 || i > ohlcv.length - 3) return false
  const low = ohlcv[i].low
  return (
    low < Math.min(ohlcv[i - 1].low, ohlcv[i - 2].low) &&
    low < Math.min(ohlcv[i + 1].low, ohlcv[i + 2].low)
  )
}

function isSwingHigh(ohlcv: OhlcData[], i: number) {
  if (i < 2 || i > ohlcv.length - 3) return false
  const high = ohlcv[i].high
  return (
    high > Math.max(ohlcv[i - 1].high, ohlcv[i - 2].high) &&
    high > Math.max(ohlcv[i + 1].high, ohlcv[i + 2].high)
  )
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

function findAnchor(ohlcv: OhlcData[], logs: string[]): { low: number, high: number } | null {
  const atr = computeAtr14(ohlcv)
  // filter indices within anchor window
  const indices = ohlcv.map((c, i) => ({ i, t: new Date(c.time * 1000) })).filter(x => inAnchorWindow(x.t)).map(x => x.i)
  if (indices.length < 10) { logs.push('[london-continuation-xau] skip: insufficient candles in anchor window'); return null }
  let best: { low: number, high: number, range: number } | null = null
  for (const i of indices) {
    if (!isSwingLow(ohlcv, i)) continue
    for (const j of indices) {
      if (j <= i) continue
      if (!isSwingHigh(ohlcv, j)) continue
      const low = ohlcv[i].low
      const high = ohlcv[j].high
      const range = high - low
      const a = atr[j] ?? atr[atr.length - 1]
      const atrOk = Number.isFinite(a) && range >= IMPULSE_ATR_MULT * a
      if (range >= MIN_IMPULSE_USD || atrOk) {
        if (!best || range > best.range) best = { low, high, range }
      }
    }
  }
  if (!best) { logs.push('[london-continuation-xau] skip: no valid impulse in 06:45–09:30'); return null }
  logs.push(`[london-continuation-xau] anchor set low=${best.low.toFixed(2)} high=${best.high.toFixed(2)} range=${best.range.toFixed(2)}`)
  return { low: best.low, high: best.high }
}

export async function evaluateLondonContinuationDiag(symbol: string): Promise<{ signal: StrategySignal | null; logs: string[] }> {
  const now = new Date()
  const logs: string[] = []
  if (symbol !== SYMBOL) return { signal: null, logs: ['skip: wrong symbol'] }
  if (!inContinuationWindow(now)) return { signal: null, logs: ['skip: continuation window closed'] }

  const ohlcv = await fetchOHLCV(SYMBOL, TF, 500)
  if (ohlcv.length < 50) return { signal: null, logs: ['skip: insufficient data'] }

  const { dateStr } = londonParts(now)
  const state = (dailyState[dateStr] ||= {})

  if (!state.anchorSet) {
    const anchor = findAnchor(ohlcv, logs)
    if (!anchor) return { signal: null, logs }
    const low = anchor.low
    const high = anchor.high
    const mid = low + 0.5 * (high - low)
    state.impulseLow = low
    state.impulseHigh = high
    state.impulseMid = mid
    state.anchorSet = true
  }

  const impulseLow = state.impulseLow as number
  const impulseHigh = state.impulseHigh as number
  const impulseMid = state.impulseMid as number
  const latest = ohlcv[ohlcv.length - 1]
  if (latest.close < impulseMid) { logs.push('[london-continuation-xau] skip: price below impulseMid'); return { signal: null, logs } }

  // Pullback zone
  const legRange = impulseHigh - impulseLow
  const pullbackZoneLow = impulseLow + PB_LOW_RATIO * legRange
  const pullbackZoneHigh = impulseLow + PB_HIGH_RATIO * legRange
  const latestIdx = ohlcv.length - 1
  const overlapsPullback = latest.low <= pullbackZoneHigh && latest.high >= pullbackZoneLow
  const closesBull = latest.close > latest.open
  const closesAboveOwnMid = latest.close >= (latest.low + latest.high) / 2

  // Breakout band
  const breakoutBase = impulseHigh
  const breakoutZoneLow = breakoutBase - BREAKOUT_BAND
  const breakoutZoneHigh = breakoutBase + BREAKOUT_BAND
  const overlapsBreakout = latest.low <= breakoutZoneHigh && latest.high >= breakoutZoneLow
  const closesAboveBase = latest.close > breakoutBase

  // Scenario A: pullback rejection into middle zone
  if (overlapsPullback && closesBull && closesAboveOwnMid) {
    if (state.lastZoneTouchIdx !== latestIdx) {
      const stop = Math.min(pullbackZoneLow - 1.0, impulseLow - 1.0)
      const entry = latest.close
      const r = Math.abs(entry - stop)
      if (r <= 0) { logs.push('[london-continuation-xau] skip: invalid R calc (pullback)'); return { signal: null, logs } }
      const tp = entry + 3 * r
      const reason = `PullbackRejection | Zone=[${pullbackZoneLow.toFixed(2)}-${pullbackZoneHigh.toFixed(2)}] ImpulseLow=${impulseLow.toFixed(2)} Stop=${stop.toFixed(2)}`
      const signal: StrategySignal = { side: Side.LONG, entry, stop, tp, score: 1.0, reason, rrr: Math.abs(tp - entry) / r, strategy: 'London Continuation (Gold)', bar_time: latest.time * 1000 }
      logs.push('[london-continuation-xau] entry: pullback zone rejection')
      state.lastZoneTouchIdx = latestIdx
      return { signal, logs }
    } else {
      logs.push('[london-continuation-xau] skip: already traded this pullback touch')
    }
  } else {
    if (!overlapsPullback) logs.push('[london-continuation-xau] debug: no pullback overlap')
    if (!closesBull) logs.push('[london-continuation-xau] debug: latest not bullish')
    if (!closesAboveOwnMid) logs.push('[london-continuation-xau] debug: latest not above own mid')
  }

  // Scenario B: breakout through intraday high band
  if (overlapsBreakout && closesBull && closesAboveBase) {
    if (state.lastBreakoutTouchIdx !== latestIdx) {
      const stop = impulseLow - 1.0
      const entry = latest.close
      const r = Math.abs(entry - stop)
      if (r <= 0) { logs.push('[london-continuation-xau] skip: invalid R calc (breakout)'); return { signal: null, logs } }
      const tp = entry + 3 * r
      const reason = `BreakoutBand | Base=${breakoutBase.toFixed(2)} Band=[${breakoutZoneLow.toFixed(2)}-${breakoutZoneHigh.toFixed(2)}] Stop=${stop.toFixed(2)}`
      const signal: StrategySignal = { side: Side.LONG, entry, stop, tp, score: 1.0, reason, rrr: Math.abs(tp - entry) / r, strategy: 'London Continuation (Gold)', bar_time: latest.time * 1000 }
      logs.push('[london-continuation-xau] entry: breakout band')
      state.lastBreakoutTouchIdx = latestIdx
      return { signal, logs }
    } else {
      logs.push('[london-continuation-xau] skip: already traded this breakout touch')
    }
  } else {
    if (!overlapsBreakout) logs.push('[london-continuation-xau] debug: no breakout overlap')
    if (!closesBull) logs.push('[london-continuation-xau] debug: latest not bullish')
    if (!closesAboveBase) logs.push('[london-continuation-xau] debug: latest not above breakout base')
  }

  return { signal: null, logs }
}

export async function evaluateLondonContinuation(symbol: string): Promise<StrategySignal | null> {
  const { signal } = await evaluateLondonContinuationDiag(symbol)
  return signal
}