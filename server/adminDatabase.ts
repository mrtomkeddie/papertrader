import { adminDb } from './firebaseAdmin';
import { Position, PositionStatus } from '../types';

// --- Positions ---
const positionsCol = adminDb.collection('positions');

export const getOpenPositions = async (): Promise<Position[]> => {
  const snap = await positionsCol.where('status', '==', PositionStatus.OPEN).get();
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Position, 'id'>) }));
};

export const addPosition = async (position: Omit<Position, 'id'>): Promise<Position> => {
  const ref = await positionsCol.add(position);
  return { id: ref.id, ...position };
};

export const updatePosition = async (updatedPosition: Position): Promise<void> => {
  await positionsCol.doc(updatedPosition.id).set(updatedPosition, { merge: true });
};

// --- Explanations ---
const explanationsCol = adminDb.collection('explanations');

export const addExplanation = async (explanation: Omit<Explanation, 'id'>): Promise<Explanation> => {
  const ref = await explanationsCol.add(explanation);
  return { id: ref.id, ...explanation };
};

export const getExplanationByPositionId = async (positionId: string): Promise<Explanation | undefined> => {
  const snap = await explanationsCol.where('position_id', '==', positionId).limit(1).get();
  if (snap.empty) return undefined;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<Explanation, 'id'>) };
};

export const updateExplanation = async (explanation: Explanation): Promise<void> => {
  await explanationsCol.doc(explanation.id).set(explanation, { merge: true });
};

// --- Ledger ---
const ledgerCol = adminDb.collection('ledger');

export const addLedgerEntry = async (entry: Omit<LedgerEntry, 'id' | 'cash_after'>): Promise<LedgerEntry> => {
  const lastSnap = await ledgerCol.orderBy('ts', 'desc').limit(1).get();
  const lastBalance = lastSnap.empty ? 0 : (lastSnap.docs[0].data() as LedgerEntry).cash_after;

  const fullEntry: Omit<LedgerEntry, 'id'> = { ...entry, cash_after: lastBalance + entry.delta_gbp };
  const ref = await ledgerCol.add(fullEntry);
  return { id: ref.id, ...fullEntry };
};

// --- Scheduler Activity ---
export const updateSchedulerActivity = async (activity: SchedulerActivity): Promise<void> => {
  await adminDb.collection('scheduler').doc('activity').set(activity, { merge: true });
};

// --- Signals ---
const signalsCol = adminDb.collection('signals');

export const getSignals = async (): Promise<Signal[]> => {
  const snap = await signalsCol.get();
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Signal, 'id'>) }));
};

export async function getClosedPositionsForStrategy(methodName: string, symbol?: string, limit: number = 50): Promise<Position[]> {
  const positionsCol = adminDb.collection('positions');
  let q = positionsCol.where('status', '==', PositionStatus.CLOSED).where('method_name', '==', methodName);
  if (symbol) {
    q = q.where('symbol', '==', symbol);
  }
  const snap = await q.get();
  const items = snap.docs
    .map((d: any) => ({ id: d.id, ...(d.data() as Position) }))
    .filter((p: Position) => p.exit_ts)
    .sort((a: Position, b: Position) => new Date(b.exit_ts!).getTime() - new Date(a.exit_ts!).getTime())
    .slice(0, limit);
  return items;
}