import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import { validateCityLocation } from '../config/allowedCities.js';
import { deleteFromCloudinary, toRelativePhotoPath } from '../utils/cloudinary.js';

/**
 * Helper to extract photo paths (returns relative path for Cloudinary CDN)
 */
const extractPhotoUrls = (files) => {
  if (!files || files.length === 0) return [];
  return files.map((file) => {
    if (file.path && file.path.startsWith('http')) {
      return toRelativePhotoPath(file.path); // Relative Cloudinary Path (e.g. v179094.../gandhinagar_dating/photos/xyz.jpg)
    }
    return `/uploads/${file.filename}`; // Local Server Disk Path
  });
};

/**
 * @desc    Update user dating profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const { name, bio, interests, datingIntent, genderPreference } = req.body;

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (datingIntent) user.datingIntent = datingIntent;
    if (genderPreference) user.genderPreference = genderPreference;

    if (interests) {
      if (Array.isArray(interests)) {
        user.interests = interests;
      } else if (typeof interests === 'string') {
        try {
          user.interests = JSON.parse(interests);
        } catch {
          user.interests = interests.split(',').map((i) => i.trim());
        }
      }
    }

    if (req.files && req.files.length > 0) {
      const newPhotoUrls = extractPhotoUrls(req.files);
      const combined = [...user.photos, ...newPhotoUrls].slice(0, 6);
      user.photos = combined;
    }

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upgrade user to Premium Plan (₹39 Plan)
 * @route   POST /api/users/upgrade-plan
 * @access  Private
 */
export const upgradePlan = async (req, res, next) => {
  try {
    const { durationDays = 30, paymentId } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + parseInt(durationDays) * 24 * 60 * 60 * 1000);

    user.plan = 'premium';
    user.planExpiresAt = expiresAt;
    await user.save();

    res.status(200).json({
      success: true,
      message: `🎉 Welcome to Premium VIP! Your ₹39 plan is active until ${expiresAt.toLocaleDateString()}.`,
      data: {
        plan: user.plan,
        planExpiresAt: user.planExpiresAt,
        paymentId: paymentId || 'MANUAL_ACTIVATION',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password
 * @route   PUT /api/users/change-password
 * @access  Private
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide currentPassword and newPassword',
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Block a user (Safety feature)
 * @route   POST /api/users/block
 * @access  Private
 */
export const blockUser = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user._id;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide targetUserId',
      });
    }

    const user = await User.findById(userId);
    if (!user.blockedUsers.includes(targetUserId)) {
      user.blockedUsers.push(targetUserId);
      await user.save();
    }

    const match = await Match.findOne({ users: { $all: [userId, targetUserId] } });
    if (match) {
      await Match.findByIdAndDelete(match._id);
      await Message.deleteMany({ matchId: match._id });
      await User.findByIdAndUpdate(userId, { $pull: { matches: targetUserId } });
      await User.findByIdAndUpdate(targetUserId, { $pull: { matches: userId } });
    }

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Report a user for inappropriate behavior
 * @route   POST /api/users/report
 * @access  Private
 */
export const reportUser = async (req, res, next) => {
  try {
    const { targetUserId, reason } = req.body;
    const userId = req.user._id;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide targetUserId to report',
      });
    }

    const user = await User.findById(userId);
    user.reportedUsers.push({
      user: targetUserId,
      reason: reason || 'Inappropriate profile/content',
    });
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User reported successfully. Our team will review this report.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload multiple photos to profile gallery (max 6)
 * @route   POST /api/users/photos
 * @access  Private
 */
export const uploadGalleryPhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least one image file',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const newPhotoUrls = extractPhotoUrls(req.files);
    const combinedPhotos = [...user.photos, ...newPhotoUrls].slice(0, 6);
    user.photos = combinedPhotos;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Photos uploaded successfully',
      data: {
        photos: user.photos,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a photo from profile gallery by URL (Also removes from Cloudinary CDN if applicable)
 * @route   DELETE /api/users/photos
 * @access  Private
 */
export const deleteGalleryPhoto = async (req, res, next) => {
  try {
    const { photoUrl } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Delete from Cloudinary CDN if photo exists
    if (photoUrl) {
      await deleteFromCloudinary(photoUrl);
    }

    user.photos = user.photos.filter((p) => p !== photoUrl);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      data: {
        photos: user.photos,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update current GPS location & verify city restriction
 * @route   PUT /api/users/location
 * @access  Private
 */
export const updateUserLocation = async (req, res, next) => {
  try {
    const { city, latitude, longitude } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const userCity = city || user.city || 'Gandhinagar';
    const validation = validateCityLocation(userCity, latitude, longitude);

    if (latitude && longitude) {
      user.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    user.city = userCity;
    user.isCityVerified = validation.isAllowed;
    await user.save();

    res.status(200).json({
      success: true,
      message: validation.reason,
      data: {
        isCityVerified: validation.isAllowed,
        city: user.city,
        location: user.location,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete user account (App Store Requirement)
 * @route   DELETE /api/users/account
 * @access  Private
 */
export const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const matches = await Match.find({ users: userId });
    const matchIds = matches.map((m) => m._id);

    await Message.deleteMany({ matchId: { $in: matchIds } });
    await Match.deleteMany({ _id: { $in: matchIds } });

    await User.updateMany({}, { $pull: { matches: userId, likes: userId, passes: userId } });
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
