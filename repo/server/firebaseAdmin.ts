import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Resolve projectId from env (supports both Vite and plain env vars)
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

// Prefer explicit service account via base64 JSON, otherwise use Application Default Credentials
const base64Cred = process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64;

const app = (() => {
  try {
    if (base64Cred) {
      const json = JSON.parse(Buffer.from(base64Cred, 'base64').toString('utf-8'));
      return initializeApp({ credential: cert(json), projectId });
    }
    // If GOOGLE_APPLICATION_CREDENTIALS is set or gcloud is configured, this will work
    return initializeApp({ credential: applicationDefault(), projectId });
  } catch (e) {
    console.error('[admin] Failed to initialize Firebase Admin SDK:', e);
    throw e;
  }
})();

export const adminDb = getFirestore(app);

console.log('[admin] Firebase Admin initialized for project:', projectId || '(unset)');