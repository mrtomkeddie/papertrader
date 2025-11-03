import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { runPriceCheckAdmin } from './tradingServiceAdmin';

async function main() {
  console.log('[RunAdminCheckOnce] Running admin price check...');
  await runPriceCheckAdmin();
  console.log('[RunAdminCheckOnce] Done.');
}

main().catch(err => {
  console.error('[RunAdminCheckOnce] Error:', err);
});