import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as db from './adminDatabase';
import { Position, Side } from '../types';

function sideStr(s: Side) { return s === Side.LONG ? 'LONG' : 'SHORT'; }

async function main() {
  const open: Position[] = await db.getOpenPositions();
  if (!open.length) {
    console.log('[ShowOpenPositions] No open positions.');
    return;
  }
  for (const p of open) {
    console.log('---');
    console.log(`id=${p.id} symbol=${p.symbol} side=${sideStr(p.side)} qty=${p.qty}`);
    console.log(`entry=${p.entry_price} stop=${p.stop_price} tp=${p.tp_price}`);
    if (p.initial_stop_price != null) {
      const risk = p.side === Side.LONG ? (p.entry_price - p.initial_stop_price) : (p.initial_stop_price - p.entry_price);
      console.log(`initial_stop=${p.initial_stop_price} initial_risk=${risk}`);
    }
    const logs = p.stop_change_logs ?? [];
    if (!logs.length) {
      console.log('stop_change_logs: (none)');
    } else {
      console.log(`stop_change_logs (${logs.length}):`);
      for (const l of logs) {
        console.log(`  [${l.ts}] stage=${l.stage} ${l.old_stop} -> ${l.new_stop}`);
      }
    }
  }
}

main().catch(err => {
  console.error('[ShowOpenPositions] Error:', err);
});