// services/firebase.ts
import { initializeApp } from 'firebase/app';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getMessaging } from 'firebase/messaging';

// Read env in both browser (Vite) and Node (process.env)
function resolveEnv(key: string): string | undefined {
  try {
    const pe = (typeof process !== 'undefined' && (process as any)?.env) ? (process as any).env : {};
    const ve = (import.meta as any)?.env;
    return pe[`VITE_${key}`] || pe[key] || ve?.[`VITE_${key}`];
  } catch {
    try {
      const ve = (import.meta as any)?.env;
      return ve?.[`VITE_${key}`];
    } catch {
      return undefined;
    }
  }
}

const firebaseConfig = {
  apiKey: resolveEnv('FIREBASE_API_KEY'),
  authDomain: resolveEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: resolveEnv('FIREBASE_PROJECT_ID'),
  storageBucket: resolveEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: resolveEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: resolveEnv('FIREBASE_APP_ID'),
};
// Debug: log presence of required keys (not values) to aid setup verification
try {
  const flags = {
    hasApiKey: Boolean(firebaseConfig.apiKey),
    hasAuthDomain: Boolean(firebaseConfig.authDomain),
    hasProjectId: Boolean(firebaseConfig.projectId),
  };
  console.log('[firebase] Env presence:', flags);
} catch {}
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain
);

let app: any = null;
let dbInstance: any = null;
let messagingInstance: any = null;
let authInstance: any = null;

try {
  app = initializeApp(firebaseConfig);
  setLogLevel('error');
  dbInstance = initializeFirestore(app, { experimentalForceLongPolling: true });
  // Skip Messaging and Auth in Node/server contexts
  const isNode = typeof window === 'undefined';
  if (!isNode) {
    try {
      messagingInstance = getMessaging(app);
    } catch (e) {
      console.warn('[firebase] Messaging initialization skipped (unsupported environment):', e instanceof Error ? e.message : String(e));
    }
    authInstance = getAuth(app);
    onAuthStateChanged(authInstance, (user) => {
      if (user) {
        console.log('[auth] User:', { uid: user.uid, isAnonymous: user.isAnonymous, providerData: user.providerData?.map(p => p.providerId) });
      } else {
        console.log('[auth] No user');
      }
    });
  }
  console.log("Firebase initialized with project:", firebaseConfig.projectId);
} catch (e) {
  console.error('🔥 Firebase init failed:', e instanceof Error ? e.message : String(e));
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