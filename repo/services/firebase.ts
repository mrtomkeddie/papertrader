// services/firebase.ts
import { initializeApp } from 'firebase/app';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getMessaging } from 'firebase/messaging';

// Resolve env in both browser (Vite) and Node (process.env) runtimes
const viteEnv: any = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : undefined;
const nodeEnv: Record<string, string | undefined> = (typeof process !== 'undefined' ? process.env : {}) as any;
const read = (primary: string, alt?: string): string | undefined => {
  // Prefer Vite's compile-time env in the browser build; fall back to Node env
  if (viteEnv && typeof viteEnv[primary] !== 'undefined') return viteEnv[primary];
  if (nodeEnv && typeof nodeEnv[primary] !== 'undefined') return nodeEnv[primary];
  if (alt && nodeEnv && typeof nodeEnv[alt] !== 'undefined') return nodeEnv[alt];
  return undefined;
};

const firebaseConfig = {
  apiKey: read('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'),
  storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID'),
  appId: read('VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID'),
};
// Debug: log presence of required keys (not values) to aid setup verification
try {
  const flags = {
    hasApiKey: Boolean(firebaseConfig.apiKey),
    hasAuthDomain: Boolean(firebaseConfig.authDomain),
    hasProjectId: Boolean(firebaseConfig.projectId),
  };
  console.log('[firebase] Env presence:', flags);
  // Non-sensitive diagnostics to help spot formatting/source issues
  const apiKey = firebaseConfig.apiKey || '';
  console.log('[firebase] apiKey diagnostics:', {
    length: apiKey.length,
    startsWithAIza: apiKey.startsWith('AIza'),
  });
  // Safe: log non-sensitive config values to pinpoint mismatches
  console.log('[firebase] Resolved config (safe):', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    appId: firebaseConfig.appId,
    messagingSenderId: firebaseConfig.messagingSenderId,
  });
} catch {}
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain
);

// Export safe diagnostics for UI overlay without leaking secrets
export const firebaseDiagnostics = {
  hasApiKey: Boolean(firebaseConfig.apiKey),
  apiKeyLen: (firebaseConfig.apiKey || '').length,
  hasAuthDomain: Boolean(firebaseConfig.authDomain),
  hasProjectId: Boolean(firebaseConfig.projectId),
};

let app: any = null;
let dbInstance: any = null;
let messagingInstance: any = null;
let authInstance: any = null;
export let firebaseInitError: string | null = null;

try {
  const isNode = typeof window === 'undefined';
  if (!isNode) {
    app = initializeApp(firebaseConfig as any);
    setLogLevel('error');
    dbInstance = initializeFirestore(app, { experimentalForceLongPolling: true });
    try {
      messagingInstance = getMessaging(app);
    } catch (e) {
      console.warn('[firebase] Messaging initialization skipped (unsupported environment):', e instanceof Error ? e.message : String(e));
    }
    try {
      authInstance = getAuth(app);
      onAuthStateChanged(authInstance, (user) => {
        if (user) {
          console.log('[auth] User:', { uid: user.uid, isAnonymous: user.isAnonymous, providerData: user.providerData?.map(p => p.providerId) });
        } else {
          console.log('[auth] No user');
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      firebaseInitError = msg;
      console.error('[firebase] Auth initialization failed:', msg);
      throw e; // preserve previous behavior of surfacing init failure
    }
    console.log("Firebase initialized with project:", firebaseConfig.projectId);
  } else {
    // In Node/server contexts we skip web SDK initialization entirely
    console.log('[firebase] Skipping client SDK init in Node runtime');
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  firebaseInitError = msg;
  console.error('🔥 Firebase init failed:', msg);
}

export const db = dbInstance;
export const messaging = messagingInstance;
export const auth = authInstance;

// Anonymous login removed; app gates UI until Google sign-in.

export const signInWithGoogle = async (): Promise<void> => {
  if (!authInstance) throw new Error('Firebase not configured. Cannot sign in.');
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(authInstance, provider);
    console.log('[auth] Signed in with Google');
  } catch (e) {
    console.error('[auth] Google sign-in failed:', e instanceof Error ? e.message : String(e));
  }
};

export const signOutUser = async (): Promise<void> => {
  if (!authInstance) return;
  try {
    await signOut(authInstance);
    console.log('[auth] Signed out');
    // No anonymous fallback in Google-only mode; App will show login gate.
  } catch (e) {
    console.error('[auth] Sign out failed:', e instanceof Error ? e.message : String(e));
  }
};