import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { getStrategySignals } from '../services/strategyService';
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
const isCryptoWindow = () => {
  const h = new Date().getUTCHours();
  return h >= 13 && h < 22;
};

let lastRunKey = '';
const alreadyRanThisInterval = () => {
  const now = new Date();
  const minuteBucket = Math.floor(now.getUTCMinutes() / 5);
  const key = `${now.toDateString()}-${now.getUTCHours()}-${minuteBucket}-${isForexWindow() ? 'forex' : isCryptoWindow() ? 'crypto' : 'none'}`;
  if (key === lastRunKey) return true;
  lastRunKey = key;
  return false;
};

const getWindowName = (): 'forex' | 'crypto' | 'none' => {
  if (isForexWindow()) return 'forex';
  if (isCryptoWindow()) return 'crypto';
  return 'none';
};

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
    msgs.push('Already ran this interval');
    console.log('[Scheduler] Already ran this interval; skipping.');
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

  const universe = [
    ...(windowName === 'forex' ? SELECTED_INSTRUMENTS.filter(m => m.category === 'Forex') : []),
    ...(windowName === 'crypto' ? SELECTED_INSTRUMENTS.filter(m => m.category === 'Crypto') : []),
  ];

  const ops: Opportunity[] = [];
  for (const m of universe) {
    try {
      const signals = await getStrategySignals(m.symbol, '1H');
      if (signals.length > 0) {
        // Pick the best signal by RRR
        signals.sort((a, b) => b.rrr - a.rrr);
        const topSignal = signals[0];
        if (!SELECTED_METHODS.includes(topSignal.strategy)) continue;
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
          suggested_timeframe: '1H',
        };
        ops.push({ symbol: m.symbol, action: { action: 'TRADE', trade } });
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
    // Execute all qualifying opportunities without ranking
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

  // Run price check to potentially close positions
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

// Dynamic scheduling to avoid minute-by-minute ticks outside market hours
function getNextForexStartUtc(now: Date): Date {
  // Forex window: Mon-Fri, 12:00–20:00 UTC. Return next 12:00 UTC on a weekday strictly after now.
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, 12, 0, 0));
    const dow = candidate.getUTCDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5 && candidate > now) return candidate;
  }
  // Fallback (shouldn't happen): next Monday 12:00 UTC
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 12, 0, 0));
}

function getNextCryptoStartUtc(now: Date): Date {
  // Crypto window: Daily, 13:00–22:00 UTC. Return next 13:00 UTC strictly after now.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0));
  if (today > now) return today;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 13, 0, 0));
}

function msToNextWindowStart(): number {
  const now = new Date();
  const forexStart = getNextForexStartUtc(now).getTime();
  const cryptoStart = getNextCryptoStartUtc(now).getTime();
  const nextStart = Math.min(forexStart, cryptoStart);
  const diff = nextStart - now.getTime();
  // Guard: never schedule less than 30 seconds
  return Math.max(diff, 30_000);
}

function scheduleNext() {
  const windowName = getWindowName();
  if (windowName === 'none') {
    const delay = msToNextWindowStart();
    console.log(`[Scheduler] Outside market hours. Next tick in ${(delay / 60000).toFixed(1)} min.`);
    setTimeout(() => {
      tick().catch(err => console.error('[Scheduler] Tick error:', err)).finally(scheduleNext);
    }, delay);
  } else {
    setTimeout(() => {
      tick().catch(err => console.error('[Scheduler] Tick error:', err)).finally(scheduleNext);
    }, 60_000);
  }
}

async function main() {
  console.log('[Scheduler] Starting... Enabled:', enabled);
  // First run immediately
  await tick();
  // Then schedule dynamically: every minute in-session, otherwise only at next window open
  scheduleNext();
}

// Basic safety for unhandled errors
process.on('unhandledRejection', (err) => {
  console.error('[Scheduler] Unhandled rejection:', err);
});

main().catch(err => {
  console.error('[Scheduler] Fatal error:', err);
});