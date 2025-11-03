import { adminDb } from '../server/firebaseAdmin';

async function deleteAll(name: string) {
  const coll = adminDb.collection(name);
  const snap = await coll.get();
  let count = 0;
  for (const d of snap.docs) {
    await d.ref.delete();
    count++;
  }
  console.log(`Deleted ${count} document(s) from ${name}`);
}

async function main() {
  console.log('Resetting Firestore collections: positions, signals, explanations, ledger');
  await deleteAll('positions');
  await deleteAll('signals');
  await deleteAll('explanations');
  await deleteAll('ledger');
  console.log('✅ Reset complete.');
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});