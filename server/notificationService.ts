import { adminDb } from './firebaseAdmin';
import { getMessaging } from 'firebase-admin/messaging';

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

    await getMessaging().send(message);
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
      return getMessaging().send(message);
    });

    await Promise.all(sendPromises);
    console.log(`[Notification] Successfully sent notifications to ${tokens.length} users`);
    return tokens.length;
  } catch (error) {
    console.error('[Notification] Error sending push notifications to all users:', error);
    return 0;
  }
};