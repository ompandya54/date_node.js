import { AppNotification, NotificationPreference } from '../models/notification.model.js';
import Device from '../models/device.model.js';
import User from '../models/user.model.js';

/**
 * @desc    Get user notifications (newest first, cap 100)
 * @route   GET /api/notifications
 * @access  Private
 */
export const getNotifications = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const rawNotifications = await AppNotification.find({ userId: viewerId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const viewer = await User.findById(viewerId);
    const blockedIds = (viewer.blockedUsers || []).map((id) => id.toString());

    const items = [];

    for (const notif of rawNotifications) {
      // Hide notifications involving blocked or deleted users
      if (notif.profileId) {
        if (blockedIds.includes(notif.profileId.toString())) {
          continue;
        }
        const sender = await User.findById(notif.profileId);
        if (!sender || !sender.isActive) {
          continue;
        }
      }

      items.push({
        id: notif._id.toString(),
        type: notif.type,
        createdAt: notif.createdAt,
        isRead: notif.isRead || false,
        profileId: notif.profileId || null,
        matchId: notif.matchId || null,
        name: notif.name || null,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark single notification as read
 * @route   POST /api/notifications/:id/read
 * @access  Private
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const viewerId = req.user._id;

    await AppNotification.findOneAndUpdate(
      { _id: id, userId: viewerId },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   POST /api/notifications/read-all
 * @access  Private
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    await AppNotification.updateMany(
      { userId: viewerId, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete single notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const viewerId = req.user._id;

    await AppNotification.findOneAndDelete({ _id: id, userId: viewerId });

    res.status(200).json({
      success: true,
      message: 'Notification deleted.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear all notifications for user
 * @route   DELETE /api/notifications
 * @access  Private
 */
export const clearAllNotifications = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    await AppNotification.deleteMany({ userId: viewerId });

    res.status(200).json({
      success: true,
      message: 'All notifications cleared.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get notification preferences
 * @route   GET /api/notifications/preferences
 * @access  Private
 */
export const getNotificationPreferences = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    let prefs = await NotificationPreference.findOne({ userId: viewerId });
    if (!prefs) {
      prefs = await NotificationPreference.create({ userId: viewerId });
    }

    res.status(200).json({
      success: true,
      data: {
        preferences: {
          likes: prefs.likes ?? true,
          matches: prefs.matches ?? true,
          messages: prefs.messages ?? true,
          icebreakers: prefs.icebreakers ?? true,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update notification preferences (partial body)
 * @route   PUT /api/notifications/preferences
 * @access  Private
 */
export const updateNotificationPreferences = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const { likes, matches, messages, icebreakers } = req.body;

    let prefs = await NotificationPreference.findOne({ userId: viewerId });
    if (!prefs) {
      prefs = new NotificationPreference({ userId: viewerId });
    }

    if (likes !== undefined) prefs.likes = Boolean(likes);
    if (matches !== undefined) prefs.matches = Boolean(matches);
    if (messages !== undefined) prefs.messages = Boolean(messages);
    if (icebreakers !== undefined) prefs.icebreakers = Boolean(icebreakers);

    await prefs.save();

    res.status(200).json({
      success: true,
      data: {
        preferences: {
          likes: prefs.likes,
          matches: prefs.matches,
          messages: prefs.messages,
          icebreakers: prefs.icebreakers,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register / upsert device push token
 * @route   POST /api/devices
 * @access  Private
 */
export const registerDevice = async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    const viewerId = req.user._id;

    if (!token || !platform || !['android', 'ios'].includes(platform)) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Valid token and platform ("android" or "ios") are required.',
        errors: {
          token: !token ? 'Device token is required' : undefined,
          platform: !['android', 'ios'].includes(platform) ? 'Platform must be android or ios' : undefined,
        },
      });
    }

    // Upsert: token belongs to one user at a time, moving it on re-register
    await Device.findOneAndUpdate(
      { token },
      { userId: viewerId, platform },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Also update User.deviceTokens
    await User.findByIdAndUpdate(viewerId, {
      $addToSet: { deviceTokens: token },
    });

    res.status(200).json({
      success: true,
      message: 'Device registered successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unregister device push token
 * @route   DELETE /api/devices/:token
 * @access  Private
 */
export const unregisterDevice = async (req, res, next) => {
  try {
    const { token } = req.params;
    const viewerId = req.user._id;

    await Device.deleteOne({ token });
    await User.findByIdAndUpdate(viewerId, {
      $pull: { deviceTokens: token },
    });

    res.status(200).json({
      success: true,
      message: 'Device unregistered successfully.',
    });
  } catch (error) {
    next(error);
  }
};
