import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, QuerySnapshot, DocumentData, DocumentSnapshot, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../services/firebase';

interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

interface UseDocumentResult<T> {
  data: T | null; // Explicitly null for not found document
  loading: boolean;
  error: string | null;
}

// Overload signatures for useDatabase
export function useDatabase<T>(collectionName: string, docId?: string): UseDocumentResult<T>;
export function useDatabase<T>(collectionName: string): UseCollectionResult<T>;

export function useDatabase<T>(collectionName: string, docId?: string): UseCollectionResult<T> | UseDocumentResult<T> {
  const [data, setData] = useState<T[] | T | null>(null); // Unified state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guard when Firebase is not configured
    if (!isFirebaseConfigured || !db) {
      setError('Firebase not configured. Add VITE_FIREBASE_* keys to repo/.env.local.');
      setLoading(false);
      setData(docId ? null : ([] as any));
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe: () => void = () => {};
    let pollTimer: number | undefined;

    const startPollingCollection = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        const items = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
        setData(items);
        setLoading(false);
      } catch (err: any) {
        console.error(`Polling error for collection ${collectionName}:`, err?.message || String(err));
      }
    };

    const clearAll = () => {
      if (unsubscribe) unsubscribe();
      if (pollTimer) window.clearInterval(pollTimer);
    };

    if (docId) {
      // Listen to a single document
      const docRef = doc(db, collectionName, docId);
      unsubscribe = onSnapshot(docRef, (docSnap: DocumentSnapshot<DocumentData>) => { // Explicit type
        if (docSnap.exists()) {
          setData({ id: docSnap.id, ...docSnap.data() } as T);
        } else {
          setData(null); // Document not found
        }
        setLoading(false);
      }, (err: any) => { // Type error as any to access message
        console.error(`Error fetching document ${docId} from ${collectionName}:`, err.message || String(err));
        setError(`Failed to load ${collectionName} data: ${err.message || String(err)}`);
        setLoading(false);
        // Fallback: one-off fetch
        (async () => {
          try {
            const snap = await getDocs(collection(db, collectionName));
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
            const found = items.find((d: any) => d.id === docId) || null;
            setData(found as T | null);
          } catch {}
        })();
      });
    } else {
      // Initial one-off fetch to populate UI
      (async () => {
        try {
          const querySnapshot = await getDocs(collection(db, collectionName));
          const items = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
          setData(items);
          setLoading(false);
        } catch (err: any) {
          console.error(`Initial fetch error for collection ${collectionName}:`, err?.message || String(err));
        }
      })();

      // Listen to a collection
      const colRef = collection(db, collectionName);
      unsubscribe = onSnapshot(colRef, (querySnapshot: QuerySnapshot<DocumentData>) => {
        const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[]; // Explicit type for array
        setData(items);
        setLoading(false);
      }, (err: any) => { // Type error as any to access message
        console.error(`Error fetching collection ${collectionName}:`, err.message || String(err));
        setError(`Failed to load ${collectionName} data: ${err.message || String(err)}`);
        setLoading(false);
        // Fallback: start polling every 3s
        startPollingCollection();
        pollTimer = window.setInterval(startPollingCollection, 3000);
      });
    }

    return () => clearAll();
  }, [collectionName, docId]);

  // Return type assertion based on docId presence
  if (docId) {
    return { data: data as T | null, loading, error };
  } else {
    return { data: data as T[], loading, error };
  }
}

// Remove dispatchDbUpdate as it's no longer needed with Firestore's real-time listeners.
// Any component that needs to force a re-render can still manipulate data via the database service.
// The react hook ensures data is always fresh.
export const dispatchDbUpdate = () => { /* No-op, real-time listener handles updates */ };