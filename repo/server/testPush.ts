import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const serverKey = process.env.FIREBASE_SERVER_KEY;
const testToken = process.env.FIREBASE_TEST_TOKEN;

if (!serverKey) {
  console.error('[push:test] Missing FIREBASE_SERVER_KEY in .env.local (Cloud Messaging legacy server key).');
  console.error('  Find it in Firebase Console → Project settings → Cloud Messaging → Legacy API keys.');
  process.exit(1);
}
if (!testToken) {
  console.error('[push:test] Missing FIREBASE_TEST_TOKEN in .env.local.');
  console.error('  Enable notifications in Settings page, copy the token, and paste it into FIREBASE_TEST_TOKEN.');
  process.exit(1);
}

async function sendLegacyFCM(to: string) {
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      notification: {
        title: 'Paper Trader Test',
        body: 'This is a test push from the local script.',
      },
      data: {
        type: 'test',
        ts: Date.now().toString(),
      }
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM request failed: ${res.status} ${res.statusText} — ${text}`);
  }
  const json = await res.json();
  console.log('[push:test] Success:', json);
}

sendLegacyFCM(testToken)
  .catch((e) => {
    console.error('[push:test] Error:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });