import dotenv from 'dotenv';
// Load base env, then allow user-specific overrides to take precedence
dotenv.config({ path: '.env.local' });
dotenv.config();
dotenv.config({ path: '.env.local.user', override: true });

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
let adcKeyFile: string | undefined;

try {
  if (base64Cred) {
    const json = JSON.parse(Buffer.from(base64Cred, 'base64').toString('utf-8')) as {
      client_email: string;
      private_key: string;
      project_id?: string;
      type?: string;
    };
    // Ensure Google Application Default Credentials are available for any library paths that rely on ADC
    try {
      const tmpDir = path.join(process.cwd(), '.tmp');
      const tmpFile = path.join(tmpDir, 'firebase-admin.json');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(tmpFile, JSON.stringify(json));
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
      adcKeyFile = tmpFile;
    } catch (e) {
      console.warn('[admin] Failed to write temporary service account file for ADC:', e);
    }
    // Initialize Admin SDK to support messaging and other services
    app = initializeApp({ credential: cert(json), projectId: projectId || json.project_id });
    // Explicitly instantiate Firestore with direct credentials to avoid ADC
    adminDb = new Firestore({
      projectId: projectId || json.project_id,
      // Prefer keyFilename path to align with google-auth expectations; credentials kept as fallback
      keyFilename: adcKeyFile,
      credentials: {
        client_email: json.client_email,
        private_key: json.private_key,
      },
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