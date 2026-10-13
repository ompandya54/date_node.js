import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import Report from '../models/report.model.js';
import Encounter from '../models/encounter.model.js';
import { AppNotification } from '../models/notification.model.js';
import { REPORT_REASON_ENUM } from '../utils/shared.utils.js';

/**
 * @desc    Block a user
 * @route   POST /api/safety/blocks
 * @access  Private
 */
export const blockProfile = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    const viewerId = req.user._id;

    if (!profileId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'profileId is required.',
      });
    }

    // 1. Add to blockedUsers atomically
    await User.findByIdAndUpdate(viewerId, {
      $addToSet: { blockedUsers: profileId },
      $pull: { likes: profileId, passes: profileId, matches: profileId },
    });

    await User.findByIdAndUpdate(profileId, {
      $pull: { likes: viewerId, passes: viewerId, matches: viewerId },
    });

    // 2. Remove matches and conversation messages
    const match = await Match.findOne({ users: { $all: [viewerId, profileId] } });
    if (match) {
      await Message.deleteMany({ matchId: match._id });
      await Match.findByIdAndDelete(match._id);
    }

    // 3. Remove encounters
    await Encounter.deleteMany({
      $or: [
        { ownerUserId: viewerId, otherUserId: profileId },
        { ownerUserId: profileId, otherUserId: viewerId },
      ],
    });

    // 4. Remove notifications
    await AppNotification.deleteMany({
      userId: viewerId,
      profileId,
    });

    res.status(200).json({
      success: true,
      message: 'Profile blocked successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unblock a user
 * @route   DELETE /api/safety/blocks/:profileId
 * @access  Private
 */
export const unblockProfile = async (req, res, next) => {
  try {
    const { profileId } = req.params;
    const viewerId = req.user._id;

    await User.findByIdAndUpdate(viewerId, {
      $pull: { blockedUsers: profileId },
    });

    res.status(200).json({
      success: true,
      message: 'Profile unblocked successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get blocked users list
 * @route   GET /api/safety/blocks
 * @access  Private
 */
export const getBlockedProfiles = async (req, res, next) => {
  try {
    const viewer = await User.findById(req.user._id).populate('blockedUsers', 'name photos isActive');

    const items = (viewer.blockedUsers || [])
      .filter((u) => u && u.isActive)
      .map((user) => {
        const photoUrl = user.photos && user.photos.length > 0
          ? (typeof user.photos[0] === 'object' ? user.photos[0].url : user.photos[0])
          : '';

        return {
          profileId: user._id.toString(),
          name: user.name || '',
          photoUrl,
        };
      });

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
 * @desc    Report a profile
 * @route   POST /api/safety/reports
 * @access  Private
 */
export const reportProfile = async (req, res, next) => {
  try {
    const { profileId, reason, details } = req.body;
    const reporterId = req.user._id;

    if (!profileId || !reason) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'profileId and reason are required.',
      });
    }

    if (!REPORT_REASON_ENUM.includes(reason)) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: `reason must be one of: ${REPORT_REASON_ENUM.join(', ')}.`,
        errors: { reason: 'Invalid report reason.' },
      });
    }

    if (details !== undefined && details !== null && typeof details === 'string' && details.length > 500) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Details cannot exceed 500 characters.',
        errors: { details: 'Report details cannot exceed 500 characters.' },
      });
    }

    const reportedUser = await User.findById(profileId);
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Reported user not found.',
      });
    }

    // Snapshot minimal evidence (reported profile fields + last 20 messages between the pair)
    const match = await Match.findOne({ users: { $all: [reporterId, profileId] } });
    let recentMessages = [];
    if (match) {
      recentMessages = await Message.find({ matchId: match._id })
        .sort({ sentAt: -1 })
        .limit(20)
        .lean();
    }

    const reportedSnapshot = {
      id: reportedUser._id.toString(),
      name: reportedUser.name,
      age: reportedUser.age,
      photos: reportedUser.photos,
      bio: reportedUser.bio,
    };

    const report = await Report.create({
      reporterId,
      reportedId: profileId,
      reason,
      details: details || '',
      evidenceSnapshot: {
        reportedProfile: reportedSnapshot,
        recentMessages,
      },
    });

    // If underage report: auto-hide reported profile pending review
    if (reason === 'underage') {
      reportedUser.hideProfile = true;
      await reportedUser.save();
    }

    res.status(201).json({
      success: true,
      data: {
        reportId: report._id.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
