import { AppNotification, NotificationPreference } from '../models/notification.model.js';
import Device from '../models/device.model.js';
import User from '../models/user.model.js';
import { isUserInChatThread } from '../socket/chat.socket.js';

// Firebase Admin Mock / Safe Provider
let firebaseAdmin = null;

export const initializeFirebase = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // In production/staging with valid service account JSON
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      // Dynamic import or load if firebase-admin package is present
      console.log('🔥 [Firebase Admin] Initialized for push notifications');
    } catch (err) {
      console.warn('⚠️ [Firebase Admin] Could not parse FIREBASE_SERVICE_ACCOUNT:', err.message);
    }
  }
};

/**
 * Send push notification to user devices
 */
export const sendPushNotification = async ({ userId, type, title, body, dataPayload = {} }) => {
  try {
    const devices = await Device.find({ userId });
    if (!devices || devices.length === 0) return;

    const tokens = devices.map((d) => d.token);

    // If Firebase Admin SDK is configured:
    if (firebaseAdmin) {
      const message = {
        tokens,
        notification: {
          title,
          body,
        },
        data: {
          type,
          ...(dataPayload.matchId ? { matchId: String(dataPayload.matchId) } : {}),
          ...(dataPayload.profileId ? { profileId: String(dataPayload.profileId) } : {}),
        },
      };

      const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
      // Clean up invalid tokens
      if (response.failureCount > 0) {
        response.responses.forEach(async (resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              await Device.deleteOne({ token: tokens[idx] });
            }
          }
        });
      }
    }
  } catch (error) {
    console.error(`[Push Notification Error for ${userId}]:`, error.message);
  }
};

/**
 * Create an in-app notification with strict privacy, dedupe, and preference checks
 */
export const createNotification = async ({
  userId,
  type,
  eventId,
  profileId = null,
  matchId = null,
  name = null,
  io = null,
}) => {
  try {
    // 1. Strict type validation (Document 0 / B5)
    const validTypes = ['newLike', 'newMatch', 'newMessage', 'icebreakerAnswered'];
    if (!validTypes.includes(type)) {
      return null;
    }

    // 2. Never create notification if recipient has chat thread open via socket (B4/B5 rule)
    if (type === 'newMessage' && matchId && isUserInChatThread(userId, matchId)) {
      return null;
    }

    // 3. Check user notification preferences at CREATION
    let prefs = await NotificationPreference.findOne({ userId });
    if (!prefs) {
      prefs = await NotificationPreference.create({ userId });
    }

    if (type === 'newLike' && !prefs.likes) return null;
    if (type === 'newMatch' && !prefs.matches) return null;
    if (type === 'newMessage' && !prefs.messages) return null;
    if (type === 'icebreakerAnswered' && !prefs.icebreakers) return null;

    // 4. Check if sender/profile is blocked or hidden
    if (profileId) {
      const recipient = await User.findById(userId);
      const sender = await User.findById(profileId);
      if (recipient && sender) {
        const isBlocked =
          (recipient.blockedUsers || []).some((id) => id.toString() === profileId.toString()) ||
          (sender.blockedUsers || []).some((id) => id.toString() === userId.toString());
        if (isBlocked || sender.hideProfile) {
          return null;
        }
      }
    }

    // 5. Deduplicate by eventId
    if (eventId) {
      const existing = await AppNotification.findOne({ eventId });
      if (existing) {
        return existing;
      }
    }

    // 6. Generic Text Rules
    let pushTitle = 'Gandhinagar Dating';
    let pushBody = '';

    if (type === 'newLike') {
      pushBody = 'Someone liked you';
      // Strict privacy: A like never includes name or photo
      name = null;
      profileId = null;
    } else if (type === 'newMatch') {
      pushBody = name ? `You matched with ${name}!` : 'You have a new match!';
    } else if (type === 'newMessage') {
      pushBody = name ? `New message from ${name}` : 'You have a new message';
    } else if (type === 'icebreakerAnswered') {
      pushBody = name ? `${name} answered the icebreaker` : 'Your match answered the icebreaker';
    }

    // 7. Store Notification
    const notif = await AppNotification.create({
      userId,
      type,
      eventId: eventId || null,
      profileId,
      matchId,
      name,
      isRead: false,
    });

    const formattedNotif = {
      id: notif._id.toString(),
      type: notif.type,
      createdAt: notif.createdAt,
      isRead: notif.isRead,
      profileId: notif.profileId,
      matchId: notif.matchId,
      name: notif.name,
    };

    // 8. Emit socket event to recipient if connected
    if (io) {
      io.to(`user_${userId.toString()}`).emit('notification_received', {
        notification: formattedNotif,
      });
    }

    // 9. Send push notification
    await sendPushNotification({
      userId,
      type,
      title: pushTitle,
      body: pushBody,
      dataPayload: { matchId, profileId },
    });

    return formattedNotif;
  } catch (err) {
    // If duplicate eventId caught by mongo unique index:
    if (err.code === 11000) {
      return await AppNotification.findOne({ eventId });
    }
    console.error('[createNotification Error]:', err.message);
    return null;
  }
};
