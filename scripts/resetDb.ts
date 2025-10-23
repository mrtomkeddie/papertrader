import { db } from '../services/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

async function deleteAll(name: string) {
  const coll = collection(db, name);
  const snap = await getDocs(coll);
  let count = 0;
  for (const d of snap.docs) {
    await deleteDoc(doc(db, name, d.id));
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