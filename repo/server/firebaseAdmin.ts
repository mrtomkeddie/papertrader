import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';

// Resolve projectId from env (supports both Vite and plain env vars)
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

// Prefer explicit service account via base64 JSON, otherwise use Application Default Credentials
const base64Cred = process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64;

let app: ReturnType<typeof initializeApp>;
let adminDb: Firestore;

try {
  if (base64Cred) {
    const json = JSON.parse(Buffer.from(base64Cred, 'base64').toString('utf-8')) as {
      client_email: string;
      private_key: string;
    };
    // Ensure Google Application Default Credentials are available for any library paths that rely on ADC
    try {
      const tmpDir = path.join(process.cwd(), '.tmp');
      const tmpFile = path.join(tmpDir, 'firebase-admin.json');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(tmpFile, JSON.stringify(json));
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
    } catch (e) {
      console.warn('[admin] Failed to write temporary service account file for ADC:', e);
    }
    // Initialize Admin SDK to support messaging and other services
    app = initializeApp({ credential: cert(json), projectId });
    // Explicitly instantiate Firestore with credentials to avoid ADC fallback
    adminDb = new Firestore({
      projectId,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  } else {
    app = initializeApp({ credential: applicationDefault(), projectId });
    adminDb = getFirestore(app) as unknown as Firestore;
  }
} catch (e) {
  console.error('[admin] Failed to initialize Firebase Admin SDK:', e);
  throw e;
}

export { adminDb };

console.log('[admin] Firebase Admin initialized for project:', projectId || '(unset)');