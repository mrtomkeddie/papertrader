// services/firebase.ts
import { initializeApp } from 'firebase/app';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

// Support both Vite (import.meta.env) and Node (process.env)
const viteEnv: any = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};

const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: viteEnv.VITE_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain) {
  console.error(
    "🔥 Firebase Configuration Error: Missing required env vars. Please set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, and VITE_FIREBASE_PROJECT_ID in .env.local or provide FIREBASE_* equivalents for server-side."
  );
  throw new Error("Firebase not configured properly. Check your .env.local.");
}

const app = initializeApp(firebaseConfig);

// Reduce noisy Firestore logs in dev and avoid network transport issues
setLogLevel('error');
export const db = initializeFirestore(app, {
  // Force long polling in dev to avoid aborted channel issues
  experimentalForceLongPolling: true,
  // Disable fetch streams to avoid proxies that terminate streaming requests
  useFetchStreams: false,
});

export const auth = getAuth(app);

// Anonymous login removed; app gates UI until Google sign-in.

export const signInWithGoogle = async (): Promise<void> => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    console.log('[auth] Signed in with Google');
  } catch (e) {
    console.error('[auth] Google sign-in failed:', e instanceof Error ? e.message : String(e));
  }
};

export const signOutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
    console.log('[auth] Signed out');
    // No anonymous fallback in Google-only mode; App will show login gate.
  } catch (e) {
    console.error('[auth] Sign out failed:', e instanceof Error ? e.message : String(e));
  }
};

// Optional: log auth state changes for debugging
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('[auth] User:', {
      uid: user.uid,
      isAnonymous: user.isAnonymous,
      providerData: user.providerData?.map(p => p.providerId),
    });
  } else {
    console.log('[auth] No user');
  }
});

console.log("Firebase initialized with project:", firebaseConfig.projectId);