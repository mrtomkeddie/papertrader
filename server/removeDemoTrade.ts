import 'dotenv/config';
import { adminDb } from './firebaseAdmin';

async function deleteExplanationsForPosition(positionId: string) {
  const expSnap = await adminDb
    .collection('explanations')
    .where('position_id', '==', positionId)
    .get();

  if (expSnap.empty) {
    console.log(`No explanations found for position ${positionId}.`);
    return;
  }

  const batch = adminDb.batch();
  expSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`Deleted ${expSnap.size} explanation(s) for position ${positionId}.`);
}

async function main() {
  try {
    // Prefer removing the demo explanation we seeded, then the associated position
    const demoExpSnap = await adminDb
      .collection('explanations')
      .where('model_notes', '==', 'Demo explanation seeded for UI preview.')
      .get();

    if (!demoExpSnap.empty) {
      const expDoc = demoExpSnap.docs[0];
      const expData = expDoc.data() as any;
      const positionId = expData.position_id as string;

      console.log(`Found demo explanation ${expDoc.id} for position ${positionId}. Deleting...`);
      await expDoc.ref.delete();
      await deleteExplanationsForPosition(positionId); // in case multiples exist

      const posRef = adminDb.collection('positions').doc(positionId);
      const posSnap = await posRef.get();
      if (posSnap.exists) {
        await posRef.delete();
        console.log(`Deleted demo position ${positionId}.`);
      } else {
        console.log(`Position ${positionId} not found; nothing to delete.`);
      }
      return;
    }

    // Fallback: delete latest EURUSD position (assumed demo)
    const posSnap = await adminDb
      .collection('positions')
      .orderBy('entry_ts', 'desc')
      .limit(1)
      .get();

    if (posSnap.empty) {
      console.log('No positions found to delete.');
      return;
    }

    const posDoc = posSnap.docs[0];
    const pos = posDoc.data() as any;
    const positionId = posDoc.id;

    console.log(`Removing latest position ${positionId} (${pos.symbol}).`);
    await deleteExplanationsForPosition(positionId);
    await posDoc.ref.delete();
    console.log('Cleanup complete.');
  } catch (err) {
    console.error('Failed to cleanup demo trade:', err);
    process.exitCode = 1;
  }
}

main();