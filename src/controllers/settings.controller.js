import User from '../models/user.model.js';
import { onLocationAllowedChanged } from '../utils/cleanup.utils.js';

/**
 * Format privacy settings response
 */
const formatPrivacySettings = (user) => {
  const hideProfile = !!user.hideProfile;
  const locationDiscoveryEnabled = user.locationDiscoveryEnabled !== false;
  const locationAllowed = !hideProfile && locationDiscoveryEnabled;

  return {
    hideProfile,
    locationDiscoveryEnabled,
    locationAllowed,
  };
};

/**
 * @desc    Get user privacy settings
 * @route   GET /api/settings/privacy
 * @access  Private
 */
export const getPrivacySettings = async (req, res, next) => {
  try {
    const user = req.user;

    res.status(200).json({
      success: true,
      data: {
        settings: formatPrivacySettings(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user privacy settings
 * @route   PUT /api/settings/privacy
 * @access  Private
 */
export const updatePrivacySettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const { hideProfile, locationDiscoveryEnabled } = req.body;

    const previousLocationAllowed = !user.hideProfile && (user.locationDiscoveryEnabled !== false);

    if (hideProfile !== undefined) {
      user.hideProfile = Boolean(hideProfile);
    }

    if (locationDiscoveryEnabled !== undefined) {
      user.locationDiscoveryEnabled = Boolean(locationDiscoveryEnabled);
    }

    const newLocationAllowed = !user.hideProfile && (user.locationDiscoveryEnabled !== false);

    await user.save();

    // If locationAllowed became false: hook ends active Nearby and Place sessions and turns Crossed Paths off
    if (previousLocationAllowed && !newLocationAllowed) {
      await onLocationAllowedChanged(user._id);
    }

    res.status(200).json({
      success: true,
      data: {
        settings: formatPrivacySettings(user),
      },
    });
  } catch (error) {
    next(error);
  }
};
