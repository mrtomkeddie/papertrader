import { Position, PositionStatus, Explanation, LedgerEntry, Signal, SchedulerActivity } from '../types';
import { db as clientDb } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, limit, where, setDoc } from 'firebase/firestore';
import * as clientDbFns from '../services/database';

// Prefer Admin SDK if available; otherwise, gracefully fall back to Web SDK
let adminDb: any;
const hasAdminCreds = Boolean(process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64);
if (hasAdminCreds) {
  try {
    const mod = await import('./firebaseAdmin');
    adminDb = mod.adminDb;
    console.log('[adminDatabase] Using Firebase Admin SDK');
  } catch (e) {
    adminDb = undefined;
    console.warn('[adminDatabase] Admin SDK unavailable; falling back to client Firestore');
  }
} else {
  adminDb = undefined;
  console.log('[adminDatabase] Admin credentials not provided; using client Firestore');
}

const requireClientDb = () => {
  if (!clientDb) throw new Error('Firebase not configured. Add VITE_FIREBASE_* to repo/.env.local.');
  return clientDb;
};

// --- Positions ---
export const getOpenPositions = async (): Promise<Position[]> => {
  if (adminDb) {
    const positionsCol = adminDb.collection('positions');
    const snap = await positionsCol.where('status', '==', PositionStatus.OPEN).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<Position, 'id'>) }));
  }
  try {
    const q = query(collection(requireClientDb(), 'positions'), where('status', '==', PositionStatus.OPEN));
    const snap = await getDocs(q);
    return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<Position, 'id'>) }));
  } catch (err: any) {
    if (err && (err.code === 'permission-denied' || /PERMISSION_DENIED/i.test(String(err)))) {
      console.warn('[adminDatabase] getOpenPositions: permission denied; returning empty list');
      return [];
    }
    throw err;
  }
};

export const addPosition = async (position: Omit<Position, 'id'>): Promise<Position> => {
  if (adminDb) {
    const ref = await adminDb.collection('positions').add(position);
    return { id: ref.id, ...position };
  }
  return clientDbFns.addPosition(position);
};

export const updatePosition = async (updatedPosition: Position): Promise<void> => {
  if (adminDb) {
    await adminDb.collection('positions').doc(updatedPosition.id).set(updatedPosition, { merge: true });
    return;
  }
  try {
    const docRef = doc(requireClientDb(), 'positions', updatedPosition.id);
    await updateDoc(docRef, updatedPosition as any);
  } catch (err: any) {
    if (err && (err.code === 'permission-denied' || /PERMISSION_DENIED/i.test(String(err)))) {
      console.warn('[adminDatabase] updatePosition: permission denied; skipping write');
      return;
    }
    throw err;
  }
};

// --- Explanations ---
export const addExplanation = async (explanation: Omit<Explanation, 'id'>): Promise<Explanation> => {
  if (adminDb) {
    const ref = await adminDb.collection('explanations').add(explanation);
    return { id: ref.id, ...explanation };
  }
  return clientDbFns.addExplanation(explanation);
};

export const getExplanationByPositionId = async (positionId: string): Promise<Explanation | undefined> => {
  if (adminDb) {
    const snap = await adminDb.collection('explanations').where('position_id', '==', positionId).limit(1).get();
    if (snap.empty) return undefined;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as Omit<Explanation, 'id'>) };
  }
  try {
    return await clientDbFns.getExplanationByPositionId(positionId);
  } catch (err: any) {
    if (err && (err.code === 'permission-denied' || /PERMISSION_DENIED/i.test(String(err)))) {
      console.warn('[adminDatabase] getExplanationByPositionId: permission denied; returning undefined');
      return undefined;
    }
    throw err;
  }
};

export const updateExplanation = async (explanation: Explanation): Promise<void> => {
  if (adminDb) {
    await adminDb.collection('explanations').doc(explanation.id).set(explanation, { merge: true });
    return;
  }
  const docRef = doc(requireClientDb(), 'explanations', explanation.id);
  await updateDoc(docRef, explanation as any);
};

// --- Ledger ---
export const addLedgerEntry = async (entry: Omit<LedgerEntry, 'id' | 'cash_after'>): Promise<LedgerEntry> => {
  if (adminDb) {
    const ledgerCol = adminDb.collection('ledger');
    const lastSnap = await ledgerCol.orderBy('ts', 'desc').limit(1).get();
    const lastBalance = lastSnap.empty ? 0 : (lastSnap.docs[0].data() as LedgerEntry).cash_after;
    const fullEntry: Omit<LedgerEntry, 'id'> = { ...entry, cash_after: lastBalance + entry.delta_gbp };
    const ref = await ledgerCol.add(fullEntry);
    return { id: ref.id, ...fullEntry };
  }
  return clientDbFns.addLedgerEntry(entry as any);
};

// --- Ledger helpers for P&L caps ---
export const getLatestLedgerBalance = async (): Promise<number> => {
  if (adminDb) {
    const snap = await adminDb.collection('ledger').orderBy('ts', 'desc').limit(1).get();
    if (snap.empty) return 0;
    const last = snap.docs[0].data() as LedgerEntry;
    return Number(last.cash_after ?? 0) || 0;
  }
  const snap = await getDocs(query(collection(requireClientDb(), 'ledger'), orderBy('ts', 'desc'), limit(1)));
  if (snap.empty) return 0;
  const last = snap.docs[0].data() as LedgerEntry;
  return Number(last.cash_after ?? 0) || 0;
};

export const sumLedgerDeltaBetween = async (startIso: string, endIso: string): Promise<number> => {
  if (adminDb) {
    const q = adminDb.collection('ledger').where('ts', '>=', startIso).where('ts', '<=', endIso);
    const snap = await q.get();
    return snap.docs
      .map((d: any) => (d.data() as LedgerEntry).delta_gbp)
      .filter((v: any) => Number.isFinite(v))
      .reduce((a: number, b: number) => a + b, 0);
  }
  const q = query(collection(requireClientDb(), 'ledger'), where('ts', '>=', startIso), where('ts', '<=', endIso));
  const snap = await getDocs(q);
  return snap.docs
    .map((d: any) => (d.data() as LedgerEntry).delta_gbp)
    .filter((v: any) => Number.isFinite(v))
    .reduce((a: number, b: number) => a + b, 0);
};

export const sumLedgerDeltaToday = async (): Promise<number> => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  return sumLedgerDeltaBetween(start, end);
};

export const sumLedgerDeltaLastNDays = async (days: number): Promise<number> => {
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - Math.max(1, days) + 1, 0, 0, 0, 0));
  const start = startDate.toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  return sumLedgerDeltaBetween(start, end);
};

// --- Scheduler Activity ---
export const updateSchedulerActivity = async (activity: SchedulerActivity): Promise<void> => {
  if (adminDb) {
    await adminDb.collection('scheduler').doc('activity').set(activity, { merge: true });
    return;
  }
  try {
    const docRef = doc(requireClientDb(), 'scheduler', 'activity');
    await setDoc(docRef, activity as any, { merge: true });
  } catch (err: any) {
    if (err && (err.code === 'permission-denied' || /PERMISSION_DENIED/i.test(String(err)))) {
      console.warn('[adminDatabase] updateSchedulerActivity: permission denied; skipping write');
      return;
    }
    throw err;
  }
};

// --- Signals ---
export const getSignals = async (): Promise<Signal[]> => {
  if (adminDb) {
    const snap = await adminDb.collection('signals').get();
    return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<Signal, 'id'>) }));
  }
  try {
    return await clientDbFns.getSignals();
  } catch (err: any) {
    if (err && (err.code === 'permission-denied' || /PERMISSION_DENIED/i.test(String(err)))) {
      console.warn('[adminDatabase] getSignals: permission denied; returning empty list');
      return [];
    }
    throw err;
  }
};

export async function getClosedPositionsForStrategy(methodName: string, symbol?: string, limitNum: number = 50): Promise<Position[]> {
  if (adminDb) {
    const positionsCol = adminDb.collection('positions');
    let q = positionsCol.where('status', '==', PositionStatus.CLOSED).where('method_name', '==', methodName);
    if (symbol) q = q.where('symbol', '==', symbol);
    const snap = await q.get();
    const items = snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as Position) }))
      .filter((p: Position) => p.exit_ts)
      .sort((a: Position, b: Position) => new Date(b.exit_ts!).getTime() - new Date(a.exit_ts!).getTime())
      .slice(0, limitNum);
    return items;
  }
  const base = query(
    collection(requireClientDb(), 'positions'),
    where('status', '==', PositionStatus.CLOSED),
    where('method_name', '==', methodName)
  );
  const q2 = symbol ? query(base, where('symbol', '==', symbol)) : base;
  const snap = await getDocs(q2);
  const items = snap.docs
    .map((d: any) => ({ id: d.id, ...(d.data() as Position) }))
    .filter((p: Position) => p.exit_ts)
    .sort((a: Position, b: Position) => new Date(b.exit_ts!).getTime() - new Date(a.exit_ts!).getTime())
    .slice(0, limitNum);
  return items;
}

// Count AI-generated positions placed today (UTC), used for daily trade cap
export const countPositionsPlacedToday = async (): Promise<number> => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  if (adminDb) {
    const snap = await adminDb
      .collection('positions')
      .where('entry_ts', '>=', start)
      .where('entry_ts', '<=', end)
      .get();
    return snap.docs.length;
  }
  const q = query(
    collection(requireClientDb(), 'positions'),
    where('entry_ts', '>=', start),
    where('entry_ts', '<=', end)
  );
  const snap = await getDocs(q);
  return snap.docs.length;
};

// Count positions placed today for a specific strategy_id (bot)
export const countPositionsPlacedTodayByStrategy = async (strategyId: string): Promise<number> => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  if (adminDb) {
    const snap = await adminDb
      .collection('positions')
      .where('strategy_id', '==', strategyId)
      .where('entry_ts', '>=', start)
      .where('entry_ts', '<=', end)
      .get();
    return snap.docs.length;
  }
  const q = query(
    collection(requireClientDb(), 'positions'),
    where('strategy_id', '==', strategyId),
    where('entry_ts', '>=', start),
    where('entry_ts', '<=', end)
  );
  const snap = await getDocs(q);
  return snap.docs.length;
};