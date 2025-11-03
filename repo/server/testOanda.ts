import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
console.log('[dotenv] loaded .env.local and .env');
import fs from 'fs';
try {
  const raw = fs.readFileSync('.env.local', 'utf-8');
  console.log('[env.local] first 120 chars:', raw.slice(0, 120).replace(/\n/g, ' | '));
  console.log('[env.local] length:', raw.length);
  console.log('[env.local] lines count:', raw.split(/\r?\n/).length);
  const parsed = dotenv.parse(raw);
  console.log('[env.local] keys parsed:', Object.keys(parsed).slice(0, 10));
} catch {}
import { getAccountSummary, mapOandaSymbol } from './broker/oanda';

async function main() {
  try {
    console.log('[ENV] OANDA_ACCOUNT_ID:', process.env.OANDA_ACCOUNT_ID || '(unset)');
    console.log('[ENV] OANDA_API_TOKEN len:', (process.env.OANDA_API_TOKEN || '').length);
    console.log('[ENV] VITE_API_KEY len:', (process.env.VITE_API_KEY || '').length);
    const summary = await getAccountSummary();
    const acct = summary?.account;
    console.log('[OANDA] Connected. Environment:', process.env.OANDA_ENV || 'practice');
    console.log('[OANDA] Account:', acct?.id || '(unknown)');
    console.log('[OANDA] Balance:', acct?.balance);
    console.log('[OANDA] Open trades:', acct?.openTradeCount);
    console.log('[OANDA] Map example:', 'OANDA:XAUUSD ->', mapOandaSymbol('OANDA:XAUUSD'));
  } catch (err) {
    console.error('[OANDA] Connectivity test failed:', err);
    process.exitCode = 1;
  }
}

main();