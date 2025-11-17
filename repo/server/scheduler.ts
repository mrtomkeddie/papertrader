import './preload';
import dotenv from 'dotenv';
// Load default local env, then allow user-specific overrides to take precedence
dotenv.config({ path: '.env.local' });
dotenv.config();
dotenv.config({ path: '.env.local.user', override: true });
import { TIMEFRAME_BY_SYMBOL } from '../constants';
import { fixedOrbFvgLvnXauBot } from '../bots/fixedOrbFvgLvnXau';
import { fixedOrbFvgLvnNasBot } from '../bots/fixedOrbFvgLvnNas';
import { executeAiTrade, runPriceCheckAdmin } from './tradingServiceAdmin';
import * as db from './adminDatabase';
import type { Opportunity } from '../types';

// Read env flags from either AUTOPILOT_* or VITE_AUTOPILOT_*
const enabled = (process.env.AUTOPILOT_ENABLED === '1') || (process.env.VITE_AUTOPILOT_ENABLED === '1');
const riskGbp = Number(process.env.AUTOPILOT_RISK_GBP ?? process.env.VITE_AUTOPILOT_RISK_GBP ?? '5');
const scanMinutes = Number(process.env.VITE_SCHEDULER_SCAN_MINUTES ?? process.env.AUTOPILOT_SCHEDULER_SCAN_MINUTES ?? '2');
// Daily cap configuration: if env is missing, don't cap; if provided but invalid, default to 5
const dailyCapEnv = process.env.VITE_DAILY_TRADE_CAP ?? process.env.AUTOPILOT_DAILY_TRADE_CAP;
const dailyCap = dailyCapEnv === undefined ? undefined : (Number.isFinite(Number(dailyCapEnv)) ? Number(dailyCapEnv) : 5);

// New York open window: after OR completes until +3h, weekdays only
const getNyOpenUtc = (date: Date): Date => {
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
};
const isNySessionWindow = () => {
  const now = new Date();
  const dow = now.getUTCDay();
  if (dow < 1 || dow > 5) return false;
  const open = getNyOpenUtc(now);
  const orEnd = new Date(open.getTime() + 15 * 60_000);
  const windowEnd = new Date(open.getTime() + 3 * 60 * 60_000);
  return now >= orEnd && now <= windowEnd;
};

let lastRunKey = '';
const alreadyRanThisInterval = () => {
  const now = new Date();
  const minutes = Math.max(1, scanMinutes);
  const bucket = Math.floor(now.getUTCMinutes() / minutes);
  const key = `${now.toDateString()}-${now.getUTCHours()}-${bucket}-${minutes}`;
  if (key === lastRunKey) return true;
  lastRunKey = key;
  return false;
};

const getWindowName = (): 'forex' | 'none' => {
  return isNySessionWindow() ? 'forex' : 'none';
};

// Kill switches removed per fixed-strategy requirement

async function tick() {
  const windowName = getWindowName();
  const msgs: string[] = [];
  const botsXau = [fixedOrbFvgLvnXauBot];
  const botsNas = [fixedOrbFvgLvnNasBot];

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
    msgs.push('skip: window closed');
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
    msgs.push(`Already ran this ${scanMinutes}-min interval`);
    console.log(`[Scheduler] Already ran this ${scanMinutes}-min interval; skipping.`);
    await db.updateSchedulerActivity({
      last_run_ts: Date.now(),
      window: windowName,
      ops_found: 0,
      trades_placed: 0,
      universe_symbols: ['OANDA:XAUUSD', 'OANDA:NAS100_USD'],
      messages: msgs,
    });
    return;
  }
  const ops: Opportunity[] = [];
  // Daily counts per instrument/side (fixed limits): max 2 longs/day, max 2 shorts/day
  const symbolBots: { symbol: string; bots: typeof botsXau }[] = [
    { symbol: 'OANDA:XAUUSD', bots: botsXau },
    { symbol: 'OANDA:NAS100_USD', bots: botsNas },
  ];
  for (const { symbol, bots } of symbolBots) {
    for (const bot of bots) {
      try {
        if (!bot.isEnabled()) { msgs.push(`bot ${bot.id} disabled`); continue; }
        const now = new Date();
        if (!bot.isWindowOpen(now)) { msgs.push(`bot ${bot.id} window closed`); continue; }
        const signals = await bot.scan();
        const trades = bot.selectSignals(signals);
        for (const trade of trades) {
          ops.push({ symbol, action: { action: 'TRADE', trade }, extra: { botId: bot.id } as any });
        }
        if (trades.length === 0) msgs.push(`bot ${bot.id} (${symbol}): no trades`);
      } catch (e) {
        msgs.push(`Scan error for bot ${bot.id} (${symbol})`);
        console.warn('[Scheduler] Scan error for bot', bot.id, symbol, e);
      }
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
      // Block duplicate open positions by symbol+side (enabled by default)
      const blockDup = ((process.env.AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE || process.env.VITE_AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE || 'true') as string).toLowerCase() === 'true';
      if (blockDup) {
        const open = (await db.getOpenPositions()).find(p => p.symbol === op.symbol && p.side === side);
        if (open) { msgs.push(`Duplicate open position on ${op.symbol} (${side})`); continue; }
      }
      // Enforce per-instrument per-side daily limits: max 2 longs/shorts
      const botId = (op as any).extra?.botId as string | undefined;
      try {
        const sideStr = side === 'LONG' ? 'LONG' : 'SHORT';
        const placedSideToday = await db.countPositionsPlacedTodayBySymbolSide(op.symbol, sideStr as any);
        if (placedSideToday >= 2) {
          msgs.push(`skip: daily per-side cap reached for ${op.symbol} (${sideStr})`);
          continue;
        }
      } catch (err) {
        console.warn('[Scheduler] Per-side daily count failed:', err);
      }
      const res = await executeAiTrade(trade, op.symbol, riskGbp, botId);
      if (res.success) {
        placed += 1;
        msgs.push(`Placed ${side} on ${op.symbol} [${botId ?? 'unknown'}]`);
        console.log(`[Scheduler] Placed ${side} trade on ${op.symbol} [${botId ?? 'unknown'}].`);
      } else {
        msgs.push(`Skipped ${op.symbol} [${botId ?? 'unknown'}]: ${res.message}`);
        console.log(`[Scheduler] Skipped trade on ${op.symbol} [${botId ?? 'unknown'}]: ${res.message}`);
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
    universe_symbols: ['OANDA:XAUUSD', 'OANDA:NAS100_USD'],
    messages: msgs,
  });
}

function getNextForexStartUtc(now: Date): Date {
  for (let i = 0; i < 8; i++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    const candidateOpen = getNyOpenUtc(date);
    const orEnd = new Date(candidateOpen.getTime() + 15 * 60_000);
    const dow = orEnd.getUTCDay();
    if (dow >= 1 && dow <= 5 && orEnd > now) return orEnd;
  }
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
  const open = getNyOpenUtc(monday);
  return new Date(open.getTime() + 15 * 60_000);
}

function scheduleNext() {
  const windowName = getWindowName();
  if (windowName === 'none') {
    const delay = getNextForexStartUtc(new Date()).getTime() - Date.now();
    const safeDelay = Math.max(delay, 30_000);
    console.log(`[Scheduler] Outside NY OR window. Next tick in ${(safeDelay / 60000).toFixed(1)} min.`);
    setTimeout(() => {
      tick().catch(err => console.error('[Scheduler] Tick error:', err)).finally(scheduleNext);
    }, safeDelay);
  } else {
    setTimeout(() => {
      tick().catch(err => console.error('[Scheduler] Tick error:', err)).finally(scheduleNext);
    }, Math.max(1, scanMinutes) * 60_000);
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