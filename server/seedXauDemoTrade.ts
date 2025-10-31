import { adminDb } from './firebaseAdmin';
import { Position, PositionStatus, Side } from '../types';

async function main() {
  const now = new Date();
  const isoNow = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // a few minutes ago

  const demo: Omit<Position, 'id'> = {
    status: PositionStatus.OPEN,
    side: Side.LONG,
    symbol: 'OANDA:XAUUSD',
    entry_ts: isoNow,
    entry_price: 2000,
    qty: 1,
    stop_price: 1970,
    initial_stop_price: 1970,
    stop_change_logs: [],
    tp_price: 2050,
    exit_ts: null,
    exit_price: null,
    pnl_gbp: null,
    R_multiple: null,
    strategy_id: 'ai-generated',
    signal_id: 'demo-xau',
    slippage_bps: 2,
    fee_bps: 1,
    method_name: 'Demo XAU Seed',
  };

  try {
    const ref = await adminDb.collection('positions').add(demo);
    console.log('Seeded XAU demo position with id:', ref.id);
  } catch (e) {
    console.error('Failed to seed XAU demo position:', e);
    process.exitCode = 1;
  }
}

main();