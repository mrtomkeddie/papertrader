import { adminDb } from './firebaseAdmin';
import { Position, PositionStatus, Side } from '../types';

async function main() {
  const now = new Date();
  const isoNow = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // a few minutes ago

  const demo: Omit<Position, 'id'> = {
    status: PositionStatus.OPEN,
    side: Side.LONG,
    symbol: 'FX:EURUSD',
    entry_ts: isoNow,
    entry_price: 1.0923,
    qty: 10000,
    stop_price: 1.0880,
    tp_price: 1.1000,
    exit_ts: null,
    exit_price: null,
    pnl_gbp: null,
    R_multiple: null,
    strategy_id: 'ai-generated',
    signal_id: 'demo-signal',
    slippage_bps: 2,
    fee_bps: 1,
    method_name: 'Demo Seed',
  };

  try {
    const ref = await adminDb.collection('positions').add(demo);
    console.log('Seeded demo position with id:', ref.id);
    console.log('Open Trades table → click the new trade to view the chart.');
  } catch (e) {
    console.error('Failed to seed demo position:', e);
    process.exitCode = 1;
  }
}

main();