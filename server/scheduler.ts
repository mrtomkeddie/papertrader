import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { SELECTED_INSTRUMENTS, SELECTED_METHODS, TIMEFRAME_BY_SYMBOL } from '../constants';
import { getStrategySignals } from '../services/strategyService';
import { fetchOHLCV } from '../services/dataService';
import { calculateATR } from '../strategies/indicators';
import { executeAiTrade, runPriceCheckAdmin } from './tradingServiceAdmin';
import * as db from './adminDatabase';
import type { Opportunity } from '../types';

// Read env flags from either AUTOPILOT_* or VITE_AUTOPILOT_*
const enabled = (process.env.AUTOPILOT_ENABLED === '1') || (process.env.VITE_AUTOPILOT_ENABLED === '1');
const riskGbp = Number(process.env.AUTOPILOT_RISK_GBP ?? process.env.VITE_AUTOPILOT_RISK_GBP ?? '5');

const isForexWindow = () => {
  const now = new Date();
  const h = now.getUTCHours();
  const d = now.getUTCDay();
  return d >= 1 && d <= 5 && h >= 12 && h < 20;
};

let lastRunKey = '';
const alreadyRanThisInterval = () => {
  const now = new Date();
  const bucket5 = Math.floor(now.getUTCMinutes() / 5);
  const key = `${now.toDateString()}-${now.getUTCHours()}-${bucket5}`;
  if (key === lastRunKey) return true;
  lastRunKey = key;
  return false;
};

const getWindowName = (): 'forex' | 'none' => {
  return isForexWindow() ? 'forex' : 'none';
};

async function shouldSkipStrategy(strategyName: string, symbol: string): Promise<string | null> {
  try {
    const recent = await db.getClosedPositionsForStrategy(strategyName, symbol, 20);
    if (!recent.length) return null;

    const pnl = recent.map((p) => Number(p.pnl_gbp ?? 0)).filter((v) => Number.isFinite(v));
    let consecutiveLosses = 0;
    for (const v of pnl) {
      if (v <= 0) consecutiveLosses++;
      else break;
    }
    if (consecutiveLosses >= 5) {
      return `Kill switch: ${strategyName} has ${consecutiveLosses} consecutive losses`;
    }

    const wins = pnl.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const lossesAbs = pnl.filter((v) => v < 0).reduce((a, b) => a + Math.abs(b), 0);
    const profitFactor = lossesAbs > 0 ? wins / lossesAbs : Infinity;

    if (pnl.length >= 10 && profitFactor < 1.0) {
      return `Kill switch: ${strategyName} profit factor ${profitFactor.toFixed(2)} < 1.0 over last ${pnl.length} trades`;
    }

    return null;
  } catch (e) {
    console.error('Kill switch check error:', e);
    return null;
  }
}

async function tick() {
  const windowName = getWindowName();
  const msgs: string[] = [];

  if (!enabled) {
    msgs.push('Scheduler disabled');
    console.log('[Scheduler] Disabled; skipping tick.');
    await db.updateSchedulerActivity({
      last_run_ts: Date.now(),
      window: windowName,
      ops_found: 0,
      trades_placed: 0,
      universe_symbols: [],
      messages: msgs,
    });
    return;
  }
  if (windowName === 'none') {
    msgs.push('Windows closed');
    console.log('[Scheduler] Windows closed; skipping.');
    await db.updateSchedulerActivity({
      last_run_ts: Date.now(),
      window: windowName,
      ops_found: 0,
      trades_placed: 0,
      universe_symbols: [],
      messages: msgs,
    });
    return;
  }
  if (alreadyRanThisInterval()) {
    msgs.push('Already ran this 5-min interval');
    console.log('[Scheduler] Already ran this 5-min interval; skipping.');
    await db.updateSchedulerActivity({
      last_run_ts: Date.now(),
      window: windowName,
      ops_found: 0,
      trades_placed: 0,
      universe_symbols: [],
      messages: msgs,
    });
    return;
  }

  const universe = SELECTED_INSTRUMENTS;

  const ops: Opportunity[] = [];
  for (const m of universe) {
    try {
      const tf = TIMEFRAME_BY_SYMBOL[m.symbol] || '1h';

      // Volatility clamp: skip dead or chaotic sessions (0.2%–1.2%)
      try {
        const pre = await fetchOHLCV(m.symbol, tf, 200);
        if (pre.length >= 20) {
          const atrSeries = calculateATR(pre, 14);
          const latestATR = atrSeries[atrSeries.length - 1];
          const latestClose = pre[pre.length - 1]?.close;
          if (Number.isFinite(latestATR) && Number.isFinite(latestClose)) {
            const atrPct = latestATR / latestClose;
            if (atrPct > 0.012) {
              msgs.push(`Skipped ${m.symbol}: ATR% ${(atrPct*100).toFixed(2)} > 1.2%`);
              continue;
            }
            if (atrPct < 0.002) {
              msgs.push(`Skipped ${m.symbol}: ATR% ${(atrPct*100).toFixed(2)} < 0.2%`);
              continue;
            }
          }
        }
      } catch (volErr) {
        console.warn('[Scheduler] Volatility clamp error:', volErr);
      }

      const signals = await getStrategySignals(m.symbol, tf);
      if (signals.length > 0) {
        signals.sort((a, b) => b.rrr - a.rrr);
        const topSignal = signals[0];
        if (!SELECTED_METHODS.includes(topSignal.strategy)) continue;

        const killReason = await shouldSkipStrategy(topSignal.strategy, m.symbol);
        if (killReason) {
          msgs.push(`Skipped ${m.symbol} ${topSignal.strategy}: ${killReason}`);
          continue;
        }

        const trade = {
          side: topSignal.side,
          entry_price: topSignal.entry,
          stop_price: topSignal.stop,
          tp_price: topSignal.tp,
          reason: topSignal.reason,
          strategy_type: topSignal.strategy,
          slippage_bps: 5,
          fee_bps: 10,
          risk_reward_ratio: topSignal.rrr,
          suggested_timeframe: tf,
        };
        ops.push({ symbol: m.symbol, action: { action: 'TRADE', trade } });
      } else {
        msgs.push(`No signals passed filters for ${m.symbol} (min R/R 1.3, clamp)`);
      }
    } catch (e) {
      msgs.push(`Scan error for ${m.symbol}`);
      console.warn('[Scheduler] Scan error for', m.symbol, e);
    }
  }

  let placed = 0;

  if (ops.length === 0) {
    msgs.push('No qualifying opportunities this run');
    console.log('[Scheduler] No qualifying opportunities this run.');
  } else {
    for (const op of ops) {
      const trade = op.action.trade!;
      const side = trade.side;
      const open = (await db.getOpenPositions()).find(p => p.symbol === op.symbol && p.side === side);
      if (open) { msgs.push(`Duplicate open position on ${op.symbol} (${side})`); continue; }
      const res = await executeAiTrade(trade, op.symbol, riskGbp);
      if (res.success) {
        placed += 1;
        msgs.push(`Placed ${side} on ${op.symbol}`);
        console.log(`[Scheduler] Placed ${side} trade on ${op.symbol}.`);
      } else {
        msgs.push(`Skipped ${op.symbol}: ${res.message}`);
        console.log(`[Scheduler] Skipped trade on ${op.symbol}: ${res.message}`);
      }
    }
  }

  if (placed === 0) {
    console.log('[Scheduler] No trades placed this run.');
  } else {
    console.log(`[Scheduler] Placed ${placed} trade(s) this run.`);
  }

  await runPriceCheckAdmin();

  await db.updateSchedulerActivity({
    last_run_ts: Date.now(),
    window: windowName,
    ops_found: ops.length,
    trades_placed: placed,
    universe_symbols: universe.map(m => m.symbol),
    messages: msgs,
  });
}

function getNextForexStartUtc(now: Date): Date {
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, 12, 0, 0));
    const dow = candidate.getUTCDay();
    if (dow >= 1 && dow <= 5 && candidate > now) return candidate;
  }
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 12, 0, 0));
}

function scheduleNext() {
  const windowName = getWindowName();
  if (windowName === 'none') {
    const delay = getNextForexStartUtc(new Date()).getTime() - Date.now();
    const safeDelay = Math.max(delay, 30_000);
    console.log(`[Scheduler] Outside forex hours. Next tick in ${(safeDelay / 60000).toFixed(1)} min.`);
    setTimeout(() => {
      tick().catch(err => console.error('[Scheduler] Tick error:', err)).finally(scheduleNext);
    }, safeDelay);
  } else {
    setTimeout(() => {
      tick().catch(err => console.error('[Scheduler] Tick error:', err)).finally(scheduleNext);
    }, 5 * 60_000);
  }
}

async function maintainOpenPositions() {
  try {
    const open = await db.getOpenPositions();
    if (open.length === 0) {
      console.log('[Scheduler] Heartbeat: no open positions.');
      return;
    }
    console.log(`[Scheduler] Heartbeat: checking ${open.length} open position(s).`);
    await runPriceCheckAdmin();
  } catch (err) {
    console.error('[Scheduler] Heartbeat error:', err);
  }
}

function scheduleHeartbeat() {
  setTimeout(() => {
    maintainOpenPositions().catch(err => console.error('[Scheduler] Heartbeat tick error:', err));
    scheduleHeartbeat();
  }, 60_000);
}

async function main() {
  console.log('[Scheduler] Starting... Enabled:', enabled);
  await tick();
  scheduleNext();
  scheduleHeartbeat();
}

process.on('unhandledRejection', (err) => {
  console.error('[Scheduler] Unhandled rejection:', err);
});

main().catch(err => {
  console.error('[Scheduler] Fatal error:', err);
});