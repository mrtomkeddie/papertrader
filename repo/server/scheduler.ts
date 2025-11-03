import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { TIMEFRAME_BY_SYMBOL } from '../constants';
import { fetchOHLCV } from '../services/dataService';
import { trendAtrBot } from '../bots/trendAtr';
import { orbBot } from '../bots/orb';
import { vwapBot } from '../bots/vwapReversion';
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

// Per-bot caps via env, fallback to defaults if env missing/invalid
const parseCap = (v: string | undefined, fallback: number): number => {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const capTrendAtr = parseCap(process.env.VITE_CAP_TRENDATR, 3);
const capOrb = parseCap(process.env.VITE_CAP_ORB, 3);
const capVwapReversion = parseCap(process.env.VITE_CAP_VWAPREVERSION, 2);

// Per-bot enable toggles via env: 1|0; if unset, use bot.isEnabled()
const parseEnable = (v: string | undefined): boolean | undefined => {
  if (v === '1') return true;
  if (v === '0') return false;
  return undefined;
};
const envEnableByBot: Record<string, boolean | undefined> = {
  trendAtr: parseEnable(process.env.VITE_ENABLE_TRENDATR),
  orb: parseEnable(process.env.VITE_ENABLE_ORB),
  vwapReversion: parseEnable(process.env.VITE_ENABLE_VWAPREVERSION),
};

const isForexWindow = () => {
  const now = new Date();
  const h = now.getUTCHours();
  const d = now.getUTCDay();
  return d >= 1 && d <= 5 && h >= 12 && h < 20;
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
  const bots = [trendAtrBot, orbBot, vwapBot];

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
      universe_symbols: ['OANDA:XAUUSD'],
      messages: msgs,
    });
    return;
  }
  const ops: Opportunity[] = [];
  // Daily cap: configurable via env; per-bot caps optional
  let placedToday = 0;
  try {
    placedToday = await db.countPositionsPlacedToday();
  } catch (err) {
    console.warn('[Scheduler] Could not count positions placed today:', err);
  }
  // Per-bot caps: unlimited if not defined
  const botCaps: Record<string, number | undefined> = {
    trendAtr: capTrendAtr,
    orb: capOrb,
    vwapReversion: capVwapReversion,
  };
  const placedByBot: Record<string, number> = {};
  for (const bot of bots) {
    try {
      placedByBot[bot.id] = await db.countPositionsPlacedTodayByStrategy(bot.id);
    } catch (err) {
      placedByBot[bot.id] = 0;
      console.warn(`[Scheduler] Could not count positions placed today for ${bot.id}:`, err);
    }
  }
  for (const bot of bots) {
    try {
      // Env-driven enable override: if explicitly disabled, skip
      const envEnabled = envEnableByBot[bot.id];
      if (envEnabled === false) { msgs.push(`skip: bot disabled via env [${bot.id}]`); continue; }
      // If not explicitly enabled/disabled via env, fall back to bot.isEnabled()
      if (envEnabled === undefined && !bot.isEnabled()) { msgs.push(`bot ${bot.id} disabled`); continue; }
      const now = new Date();
      if (!bot.isWindowOpen(now)) { msgs.push(`bot ${bot.id} window closed`); continue; }
      const signals = await bot.scan();
      const trades = bot.selectSignals(signals);
      for (const trade of trades) {
        ops.push({ symbol: 'OANDA:XAUUSD', action: { action: 'TRADE', trade }, extra: { botId: bot.id } as any });
      }
      if (trades.length === 0) msgs.push(`bot ${bot.id}: no trades`);
    } catch (e) {
      msgs.push(`Scan error for bot ${bot.id}`);
      console.warn('[Scheduler] Scan error for bot', bot.id, e);
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
      // Optional: block duplicate open positions by symbol+side (disabled by default)
      const blockDup = ((process.env.AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE || process.env.VITE_AUTOPILOT_BLOCK_DUPLICATE_SYMBOL_SIDE || 'false') as string).toLowerCase() === 'true';
      if (blockDup) {
        const open = (await db.getOpenPositions()).find(p => p.symbol === op.symbol && p.side === side);
        if (open) { msgs.push(`Duplicate open position on ${op.symbol} (${side})`); continue; }
      }
      // Enforce daily cap if configured
      if (dailyCap !== undefined && (placedToday + placed) >= dailyCap) {
        msgs.push(`skip: daily cap reached (${dailyCap} trades)`);
        continue;
      }
      // Enforce per-bot cap if configured
      const botId = (op as any).extra?.botId as string | undefined;
      const capForBot = botId ? botCaps[botId] : undefined;
      if (botId && capForBot !== undefined) {
        const placedForBot = (placedByBot[botId] ?? 0) + ops.filter(o => (o as any).extra?.botId === botId).length;
        if (placedForBot >= capForBot) {
          msgs.push(`skip: ${botId} bot cap reached (${capForBot}/day)`);
          continue;
        }
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
    universe_symbols: ['OANDA:XAUUSD'],
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