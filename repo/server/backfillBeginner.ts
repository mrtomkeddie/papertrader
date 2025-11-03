import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { adminDb } from './firebaseAdmin';
import { StopLogic, Position, Strategy, Explanation } from '../types';
import { generateBeginnerExplanationText } from '../services/geminiService';

function computeRiskGbp(p: Position): number {
  const risk = Math.abs(p.entry_price - p.stop_price) * p.qty;
  return Number.isFinite(risk) ? Number(risk.toFixed(2)) : 5;
}

function inferStopLogic(method?: string): StopLogic {
  const m = method?.toUpperCase() || '';
  return m.includes('SWING') ? StopLogic.SWING : StopLogic.ATR;
}

function buildStrategyForPosition(p: Position, stratDoc?: Partial<Strategy>): Strategy {
  const base: Strategy = {
    id: p.strategy_id,
    name: stratDoc?.name || p.method_name || 'AI Generated',
    symbol: p.symbol,
    timeframe: stratDoc?.timeframe || '1H',
    risk_per_trade_gbp: stratDoc?.risk_per_trade_gbp ?? computeRiskGbp(p),
    stop_logic: stratDoc?.stop_logic ?? inferStopLogic(p.method_name),
    atr_mult: stratDoc?.atr_mult ?? 1.5,
    take_profit_R: stratDoc?.take_profit_R ?? 2,
    slippage_bps: stratDoc?.slippage_bps ?? p.slippage_bps,
    fee_bps: stratDoc?.fee_bps ?? p.fee_bps,
    enabled: true,
  };
  return base;
}

async function fetchPosition(positionId: string): Promise<Position | null> {
  const snap = await adminDb.collection('positions').doc(positionId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<Position, 'id'>;
  return { id: positionId, ...data } as Position;
}

async function fetchStrategy(strategyId: string): Promise<Partial<Strategy> | null> {
  try {
    const snap = await adminDb.collection('strategies').doc(strategyId).get();
    if (!snap.exists) return null;
    return snap.data() as Strategy;
  } catch {
    return null;
  }
}

async function backfillOnce(expl: Explanation): Promise<boolean> {
  const position = await fetchPosition(expl.position_id);
  if (!position) {
    console.warn(`[backfill] Missing position for explanation ${expl.id}, position_id=${expl.position_id}`);
    return false;
  }

  const stratDoc = position.strategy_id && position.strategy_id !== 'ai-generated'
    ? await fetchStrategy(position.strategy_id)
    : null;
  const strategy = buildStrategyForPosition(position, stratDoc || undefined);

  try {
    const beginner = await generateBeginnerExplanationText(position, strategy);
    await adminDb.collection('explanations').doc(expl.id).set({ beginner_friendly_entry: beginner }, { merge: true });
    console.log(`[backfill] Updated explanation ${expl.id} for position ${position.id}`);
    return true;
  } catch (e) {
    console.error(`[backfill] Failed explanation ${expl.id}:`, e);
    return false;
  }
}

async function main() {
  console.log('[backfill] Starting beginner-friendly text backfill...');
  const snap = await adminDb.collection('explanations').get();
  const items: Explanation[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Explanation, 'id'>) }));

  const missing = items.filter(e => !e.beginner_friendly_entry || e.beginner_friendly_entry.trim() === '');
  console.log(`[backfill] Found ${items.length} explanations, ${missing.length} missing beginner text.`);

  let updated = 0;
  for (const e of missing) {
    const ok = await backfillOnce(e);
    if (ok) updated++;
    // modest pacing to avoid rate limits
    await new Promise(res => setTimeout(res, 400));
  }

  console.log(`[backfill] Completed. Updated ${updated}/${missing.length} explanations.`);
}

main().catch(err => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});