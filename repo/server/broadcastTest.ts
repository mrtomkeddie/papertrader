import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { sendPushNotificationToAll } from './notificationService';

async function main() {
  console.log('[broadcast:test] Starting broadcast test...');
  const sent = await sendPushNotificationToAll(
    'Paper Trader Broadcast Test',
    'This is a test notification sent to all saved device tokens.',
    { type: 'broadcast_test', ts: String(Date.now()) }
  );
  console.log(`[broadcast:test] Finished. Notifications attempted for ${sent} token(s).`);
}

main().catch((e) => {
  console.error('[broadcast:test] Error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});