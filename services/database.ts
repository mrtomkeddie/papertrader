import { Strategy, Signal, Position, Explanation, LedgerEntry, StopLogic, PositionStatus, Side, LedgerRefType } from '../types';
import { DEFAULT_SYMBOL } from '../constants';
import { db } from './firebase'; // Import Firestore instance
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, where, getDoc } from 'firebase/firestore'; // Added 'where', 'getDoc'
import { setDoc } from 'firebase/firestore'; // Added for scheduler activity updates

// Helper to convert Firestore DocumentData to desired type with ID
const mapDocToType = <T extends { id?: string }>(doc: any): T => ({
  id: doc.id,
  ...doc.data(),
} as T);

// --- Strategies ---
const strategiesCollection = collection(db, 'strategies');

export const getStrategies = async (): Promise<Strategy[]> => {
  const querySnapshot = await getDocs(strategiesCollection);
  return querySnapshot.docs.map(mapDocToType<Strategy>);
};

export const addStrategy = async (strategy: Omit<Strategy, 'id'>): Promise<Strategy> => {
  const docRef = await addDoc(strategiesCollection, strategy);
  return { id: docRef.id, ...strategy };
};

export const updateStrategy = async (updatedStrategy: Strategy): Promise<void> => {
  const docRef = doc(db, 'strategies', updatedStrategy.id);
  await updateDoc(docRef, updatedStrategy);
};

export const deleteStrategy = async (id: string): Promise<void> => {
  const docRef = doc(db, 'strategies', id);
  await deleteDoc(docRef);
};

// --- Signals ---
const signalsCollection = collection(db, 'signals');

export const getSignals = async (): Promise<Signal[]> => {
  const querySnapshot = await getDocs(signalsCollection);
  return querySnapshot.docs.map(mapDocToType<Signal>);
};

export const addSignal = async (signal: Omit<Signal, 'id'>): Promise<Signal> => {
  const docRef = await addDoc(signalsCollection, signal);
  return { id: docRef.id, ...signal };
};

export const getLatestSignalForSymbol = async (symbol: string): Promise<Signal | undefined> => {
  const q = query(signalsCollection, orderBy('bar_time', 'desc'), limit(1));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    return mapDocToType<Signal>(querySnapshot.docs[0]);
  }
  return undefined;
};


// --- Positions ---
const positionsCollection = collection(db, 'positions');

export const getPositions = async (): Promise<Position[]> => {
  const querySnapshot = await getDocs(positionsCollection);
  return querySnapshot.docs.map(mapDocToType<Position>);
};

export const getPositionById = async (id: string): Promise<Position | undefined> => {
  const docRef = doc(db, 'positions', id);
  const docSnap = await getDoc(docRef); // FIX: Use getDoc for single document
  if (docSnap.exists()) {
    return mapDocToType<Position>(docSnap);
  }
  return undefined;
};

export const getOpenPositions = async (): Promise<Position[]> => {
  // Firestore queries for status will be needed for large datasets
  // For now, continue to fetch all and filter to leverage useDatabase's real-time capabilities
  const q = query(positionsCollection, where('status', '==', PositionStatus.OPEN));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(mapDocToType<Position>);
};

export const addPosition = async (position: Omit<Position, 'id'>): Promise<Position> => {
  const docRef = await addDoc(positionsCollection, position);
  return { id: docRef.id, ...position };
};

export const updatePosition = async (updatedPosition: Position): Promise<void> => {
  const docRef = doc(db, 'positions', updatedPosition.id);
  await updateDoc(docRef, updatedPosition);
};

// --- Explanations ---
const explanationsCollection = collection(db, 'explanations');

export const getExplanations = async (): Promise<Explanation[]> => {
  const querySnapshot = await getDocs(explanationsCollection);
  return querySnapshot.docs.map(mapDocToType<Explanation>);
};

export const getExplanationByPositionId = async (positionId: string): Promise<Explanation | undefined> => {
  // Fix: Query directly by position_id using a 'where' clause
  const q = query(explanationsCollection, where('position_id', '==', positionId), limit(1));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    return mapDocToType<Explanation>(querySnapshot.docs[0]);
  }
  return undefined;
};

export const addExplanation = async (explanation: Omit<Explanation, 'id'>): Promise<Explanation> => {
  const docRef = await addDoc(explanationsCollection, explanation);
  return { id: docRef.id, ...explanation };
};

export const updateExplanation = async (updatedExplanation: Explanation): Promise<void> => {
  // Fix: Assuming ID exists for update, which is now true because Explanation interface has 'id'
  const docRef = doc(db, 'explanations', updatedExplanation.id);
  await updateDoc(docRef, updatedExplanation);
};

// --- Ledger ---
const ledgerCollection = collection(db, 'ledger');

export const getLedger = async (): Promise<LedgerEntry[]> => {
  const querySnapshot = await getDocs(query(ledgerCollection, orderBy('ts', 'asc')));
  return querySnapshot.docs.map(mapDocToType<LedgerEntry>);
};

export const addLedgerEntry = async (entry: Omit<LedgerEntry, 'id'>): Promise<LedgerEntry> => {
    // Fetch all ledger entries to calculate cash_after.
    // NOTE: For large datasets, this should be optimized with a query for the last entry,
    // or by updating the balance directly in a user document/global state.
    const ledgerEntries = await getDocs(query(ledgerCollection, orderBy('ts', 'desc'), limit(1)));
    const lastBalance = ledgerEntries.empty ? 0 : mapDocToType<LedgerEntry>(ledgerEntries.docs[0]).cash_after;
    
    entry.cash_after = lastBalance + entry.delta_gbp;
    const docRef = await addDoc(ledgerCollection, entry);
    return { id: docRef.id, ...entry };
};

// --- Initialization ---
export const initDb = async () => {
  console.log("Initializing Firebase Firestore...");
  const strategies = await getStrategies();
  if (strategies.length === 0) {
    console.log("Seeding initial strategies to Firestore...");
    const initialStrategies: Omit<Strategy, 'id'>[] = [
      {
        name: "AAPL EMA Crossover",
        symbol: "AAPL",
        timeframe: "5m",
        risk_per_trade_gbp: 5,
        stop_logic: StopLogic.ATR,
        atr_mult: 1.5,
        take_profit_R: 2,
        slippage_bps: 10,
        fee_bps: 0,
        enabled: true,
      },
      {
        name: "BTCUSD Breakout",
        symbol: "COINBASE:BTCUSD",
        timeframe: "1H",
        risk_per_trade_gbp: 5,
        stop_logic: StopLogic.ATR,
        atr_mult: 2,
        take_profit_R: 3,
        slippage_bps: 20,
        fee_bps: 15,
        enabled: false,
      },
      {
        name: "EURUSD Trend Follow",
        symbol: "FX:EURUSD",
        timeframe: "1D",
        risk_per_trade_gbp: 5,
        stop_logic: StopLogic.SWING,
        atr_mult: 1, // Less relevant for SWING but good to have a value
        take_profit_R: 2.5,
        slippage_bps: 5,
        fee_bps: 0,
        enabled: false,
      }
    ];
    for (const s of initialStrategies) {
      await addStrategy(s);
    }
  } else {
    console.log("Firestore already contains strategies. Skipping seeding.");
  }
};

export interface SchedulerActivity {
  id?: string;
  last_run_ts: number;
  window: 'forex' | 'none';
  ops_found: number;
  trades_placed: number;
  universe_symbols: string[];
  messages?: string[];
}

export const updateSchedulerActivity = async (activity: SchedulerActivity): Promise<void> => {
  const docRef = doc(db, 'scheduler', 'activity');
  await setDoc(docRef, activity, { merge: true });
};

export { db };