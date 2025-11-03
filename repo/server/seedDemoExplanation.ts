import 'dotenv/config';
import { adminDb } from './firebaseAdmin';

async function main() {
  try {
    // Find the latest position by entry_ts (avoid composite index)
    const snapshot = await adminDb
      .collection('positions')
      .orderBy('entry_ts', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('No positions found. Run "npm run seed:demo" first.');
      return;
    }

    const doc = snapshot.docs[0];
    const pos = doc.data();
    const positionId = doc.id;

    const entryTs = pos.entry_ts as string;
    const exitTs = pos.exit_ts as string | null | undefined;

    const explanation = {
      position_id: positionId,
      created_ts: new Date().toISOString(),
      plain_english_entry: `Entered ${pos.symbol} ${pos.side} at ${pos.entry_price} on ${new Date(entryTs).toLocaleString()}. Stop at ${pos.stop_price}, target at ${pos.tp_price}.`,
      beginner_friendly_entry: `We entered ${pos.symbol} because we expected the price to move in our favor. If the price falls to ${pos.stop_price}, we will exit to limit loss. If it rises to ${pos.tp_price}, we will take profit. Entry was on ${new Date(entryTs).toLocaleString()}.`,
      exit_reason: exitTs ? `Exited at ${pos.exit_price} on ${new Date(exitTs).toLocaleString()}.` : null,
      model_notes: 'Demo explanation seeded for UI preview.'
    } as any;

    const ref = await adminDb.collection('explanations').add(explanation);
    console.log(`Seeded demo explanation for position ${positionId} as ${ref.id}`);
  } catch (err) {
    console.error('Failed to seed demo explanation:', err);
    process.exitCode = 1;
  }
}

main();