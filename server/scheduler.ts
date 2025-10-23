import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { SELECTED_INSTRUMENTS, SELECTED_METHODS } from '../constants';
import { getAiTradeAction } from '../services/geminiService';
import { executeAiTrade } from './tradingServiceAdmin';
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
const alreadyRanThisHour = () => {
  const now = new Date();
  const key = `${now.toDateString()}-${now.getUTCHours()}-${isForexWindow() ? 'forex' : isCryptoWindow() ? 'crypto' : 'none'}`;
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
  if (alreadyRanThisHour()) {
    msgs.push('Already ran this hour');
    console.log('[Scheduler] Already ran this hour; skipping.');
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
      const action = await getAiTradeAction(m.symbol, '1H');
      if (action.action === 'TRADE') {
        const st = action.trade?.strategy_type;
        if (!st || !SELECTED_METHODS.includes(st)) continue;
        ops.push({ symbol: m.symbol, action });
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

  await db.updateSchedulerActivity({
    last_run_ts: Date.now(),
    window: windowName,
    ops_found: ops.length,
    trades_placed: placed,
    universe_symbols: universe.map(m => m.symbol),
    messages: msgs,
  });
}

async function main() {
  console.log('[Scheduler] Starting... Enabled:', enabled);
  // First run immediately
  await tick();
  // Then run every minute
  setInterval(() => { tick().catch(err => console.error('[Scheduler] Tick error:', err)); }, 60_000);
}

// Basic safety for unhandled errors
process.on('unhandledRejection', (err) => {
  console.error('[Scheduler] Unhandled rejection:', err);
});

main().catch(err => {
  console.error('[Scheduler] Fatal error:', err);
});