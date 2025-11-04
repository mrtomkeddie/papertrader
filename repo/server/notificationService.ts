let adminDb: any;
let adminMessaging: any;
const hasAdminCreds = Boolean(process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64);
if (hasAdminCreds) {
  try {
    const mod = await import('./firebaseAdmin');
    adminDb = mod.adminDb;
    const msgMod = await import('firebase-admin/messaging');
    adminMessaging = msgMod.getMessaging();
    console.log('[Notification] Admin messaging enabled');
  } catch (e) {
    adminDb = undefined;
    adminMessaging = undefined;
    console.warn('[Notification] Admin SDK/messaging unavailable; notifications disabled');
  }
} else {
  adminDb = undefined;
  adminMessaging = undefined;
  console.log('[Notification] Admin credentials not provided; notifications disabled');
}

/**
 * Sends a push notification to a user when a trade is opened or closed
 * @param userId The user ID to send the notification to
 * @param title The notification title
 * @param body The notification body
 * @param data Additional data to send with the notification
 */
export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> => {
  try {
    if (!adminDb || !adminMessaging) {
      console.log('[Notification] Skipped: Admin messaging not available');
      return false;
    }
    // Get the user's FCM token from Firestore
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.fcmToken) {
      console.log(`[Notification] No FCM token found for user ${userId}`);
      return false;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data,
      token: userData.fcmToken,
    };

    await adminMessaging.send(message);
    console.log(`[Notification] Successfully sent notification to user ${userId}`);
    return true;
  } catch (error) {
    console.error('[Notification] Error sending push notification:', error);
    return false;
  }
};

/**
 * Sends a push notification to all users with FCM tokens
 * @param title The notification title
 * @param body The notification body
 * @param data Additional data to send with the notification
 */
export const sendPushNotificationToAll = async (
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<number> => {
  try {
    if (!adminDb || !adminMessaging) {
      console.log('[Notification] Skipped broadcast: Admin messaging not available');
      return 0;
    }
    // Get all users with FCM tokens
    const usersSnapshot = await adminDb.collection('users').get();
    const tokens: string[] = [];
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      console.log('[Notification] No FCM tokens found for any users');
      return 0;
    }

    // Send to each token (could use multicast for up to 500 tokens)
    const sendPromises = tokens.map(token => {
      const message = {
        notification: {
          title,
          body,
        },
        data,
        token,
      };
      return adminMessaging.send(message);
    });

    await Promise.all(sendPromises);
    console.log(`[Notification] Successfully sent notifications to ${tokens.length} users`);
    return tokens.length;
  } catch (error) {
    console.error('[Notification] Error sending push notifications to all users:', error);
    return 0;
  }
};