import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import PendingPhoto from '../models/photo.model.js';
import { NearbySession, NearbyConsent } from '../models/nearby.model.js';
import { PlaceSession, PlaceConsent } from '../models/place.model.js';
import Encounter from '../models/encounter.model.js';
import { AppNotification, NotificationPreference } from '../models/notification.model.js';
import Device from '../models/device.model.js';
import { deleteFromCloudinary } from './cloudinary.js';

/**
 * Hook triggered when locationAllowed changes
 */
export const onLocationAllowedChanged = async (userId) => {
  try {
    // End active Nearby and Place sessions
    await NearbySession.deleteMany({ userId });
    await PlaceSession.deleteMany({ userId });

    // Turn Crossed Paths recording off
    await User.findByIdAndUpdate(userId, { recordingEnabled: false });
  } catch (error) {
    console.error(`[onLocationAllowedChanged Error for ${userId}]:`, error.message);
  }
};

/**
 * Centralized complete user data deletion
 */
export const deleteUserData = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (user) {
      // 1. Delete Cloudinary photo assets
      if (user.photos && user.photos.length > 0) {
        for (const photo of user.photos) {
          const url = typeof photo === 'object' ? photo.url : photo;
          try {
            await deleteFromCloudinary(url);
          } catch {}
        }
      }

      // 2. Delete pending photos
      const pendingPhotos = await PendingPhoto.find({ userId });
      for (const p of pendingPhotos) {
        try {
          await deleteFromCloudinary(p.url);
        } catch {}
      }
      await PendingPhoto.deleteMany({ userId });

      // 3. Delete matches and messages
      const matches = await Match.find({ users: userId });
      const matchIds = matches.map((m) => m._id);
      await Message.deleteMany({ matchId: { $in: matchIds } });
      await Match.deleteMany({ _id: { $in: matchIds } });

      // 4. Remove user from all other users' references
      await User.updateMany(
        {},
        {
          $pull: {
            matches: userId,
            likes: userId,
            passes: userId,
            actedOn: userId,
            blockedUsers: userId,
          },
        }
      );

      // 5. Delete location sessions & consent
      await NearbySession.deleteMany({ userId });
      await NearbyConsent.deleteMany({ userId });
      await PlaceSession.deleteMany({ userId });
      await PlaceConsent.deleteMany({ userId });

      // 6. Delete encounters (both owner and references)
      await Encounter.deleteMany({
        $or: [{ ownerUserId: userId }, { otherUserId: userId }],
      });

      // 7. Delete notifications, preferences, and device tokens
      await AppNotification.deleteMany({ userId });
      await NotificationPreference.deleteMany({ userId });
      await Device.deleteMany({ userId });

      // 8. Delete user record
      await User.findByIdAndDelete(userId);
    }

    return true;
  } catch (error) {
    console.error(`[deleteUserData Error for ${userId}]:`, error.message);
    throw error;
  }
};
