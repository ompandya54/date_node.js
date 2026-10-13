import Encounter from '../models/encounter.model.js';
import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import { canSee } from '../utils/shared.utils.js';
import { createNotification } from '../utils/notification.utils.js';

/**
 * Format encounter for client response (strictly zero location info)
 */
const formatEncounterResponse = (encounter, otherUser) => {
  const photoUrl =
    otherUser.photos && otherUser.photos.length > 0
      ? typeof otherUser.photos[0] === 'object'
        ? otherUser.photos[0].url
        : otherUser.photos[0]
      : '';

  return {
    id: encounter._id.toString(),
    profileId: otherUser._id.toString(),
    name: otherUser.name || '',
    age: otherUser.age || 0,
    photoUrl,
    datingIntent: otherUser.datingIntent || 'longTermRelationship',
    crossedAt: new Date(encounter.crossedAt).toISOString(),
    expiresAt: new Date(encounter.expiresAt).toISOString(),
    isNew: !encounter.seen,
    interestExpressed: encounter.interestExpressed || false,
  };
};

/**
 * @desc    Get user's Crossed Paths encounters
 * @route   GET /api/crossed-paths
 * @access  Private
 */
export const getCrossedPaths = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const now = new Date();

    // 1. Purge expired encounters
    await Encounter.deleteMany({
      ownerUserId: viewerId,
      expiresAt: { $lte: now },
    });

    const encounters = await Encounter.find({
      ownerUserId: viewerId,
      expiresAt: { $gt: now },
    })
      .sort({ crossedAt: -1 })
      .populate('otherUserId', 'name age gender interestedIn photos isActive hideProfile blockedUsers datingIntent matches actedOn onboardingCompleted')
      .lean();

    const viewer = await User.findById(viewerId);
    const viewerMatches = (viewer.matches || []).map((id) => id.toString());
    const viewerActedOn = (viewer.actedOn || []).map((id) => id.toString());

    const items = [];

    for (const enc of encounters) {
      const otherUser = enc.otherUserId;
      if (!otherUser || !otherUser.isActive) continue;

      const otherId = otherUser._id.toString();

      // Exclude matched profiles
      if (viewerMatches.includes(otherId)) continue;

      // Visibility and block check
      if (!canSee(viewer, otherUser, true)) continue;

      // If user acted-on in Discovery (liked or passed elsewhere):
      // hide UNLESS interest was expressed through this Crossed Paths feature
      if (viewerActedOn.includes(otherId) && !enc.interestExpressed) {
        continue;
      }

      items.push(formatEncounterResponse(enc, otherUser));
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
 * @desc    Mark encounters as seen
 * @route   POST /api/crossed-paths/seen
 * @access  Private
 */
export const markCrossedPathsSeen = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const { ids = [] } = req.body;

    if (Array.isArray(ids) && ids.length > 0) {
      await Encounter.updateMany(
        {
          _id: { $in: ids },
          ownerUserId: viewerId,
        },
        { $set: { seen: true } }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Encounters marked as seen.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Express interest in an encounter (same effect as like, idempotent)
 * @route   POST /api/crossed-paths/:id/interest
 * @access  Private
 */
export const expressCrossedPathInterest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const viewerId = req.user._id;
    const now = new Date();

    const encounter = await Encounter.findOne({
      _id: id,
      ownerUserId: viewerId,
      expiresAt: { $gt: now },
    });

    if (!encounter) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Encounter not found or expired.',
      });
    }

    const otherUserId = encounter.otherUserId.toString();
    const candidate = await User.findById(otherUserId);
    const viewer = await User.findById(viewerId);

    if (!candidate || !candidate.isActive) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Mark interest on this encounter
    encounter.interestExpressed = true;
    encounter.seen = true;
    await encounter.save();

    // Record like and actedOn on viewer
    if (!(viewer.likes || []).some((uid) => uid.toString() === otherUserId)) {
      viewer.likes.push(candidate._id);
    }
    if (!(viewer.actedOn || []).some((uid) => uid.toString() === otherUserId)) {
      viewer.actedOn.push(candidate._id);
    }
    await viewer.save();

    // Check if candidate already liked viewer (Mutual Match)
    const candidateLikedMe = (candidate.likes || []).some(
      (uid) => uid.toString() === viewerId.toString()
    );

    if (candidateLikedMe) {
      let match = await Match.findOne({
        users: { $all: [viewerId, candidate._id] },
      });

      if (!match) {
        match = await Match.create({
          users: [viewerId, candidate._id],
          matchedAt: new Date(),
          seenBy: [],
        });

        if (!viewer.matches.includes(candidate._id)) {
          viewer.matches.push(candidate._id);
          await viewer.save();
        }
        if (!candidate.matches.includes(viewerId)) {
          candidate.matches.push(viewerId);
          await candidate.save();
        }

        // B5 Match notification
        const io = req.app.get('io');
        await createNotification({
          userId: viewerId,
          type: 'newMatch',
          eventId: `match_${match._id}_${viewerId}`,
          profileId: candidate._id.toString(),
          matchId: match._id.toString(),
          name: candidate.name || '',
          io,
        });

        await createNotification({
          userId: candidate._id,
          type: 'newMatch',
          eventId: `match_${match._id}_${candidate._id}`,
          profileId: viewerId.toString(),
          matchId: match._id.toString(),
          name: viewer.name || '',
          io,
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          outcome: 'matched',
          matchId: match._id.toString(),
        },
      });
    }

    // Normal like outcome: waiting
    res.status(200).json({
      success: true,
      data: {
        outcome: 'waiting',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Dismiss an encounter (deletes encounter & records a pass)
 * @route   POST /api/crossed-paths/:id/dismiss
 * @access  Private
 */
export const dismissCrossedPath = async (req, res, next) => {
  try {
    const { id } = req.params;
    const viewerId = req.user._id;

    const encounter = await Encounter.findOne({
      _id: id,
      ownerUserId: viewerId,
    });

    if (encounter) {
      const otherUserId = encounter.otherUserId;
      await User.findByIdAndUpdate(viewerId, {
        $addToSet: { passes: otherUserId, actedOn: otherUserId },
      });
      await Encounter.findByIdAndDelete(id);
    }

    res.status(200).json({
      success: true,
      message: 'Encounter dismissed.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Crossed Paths recording settings
 * @route   GET /api/crossed-paths/settings
 * @access  Private
 */
export const getCrossedPathsSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      data: {
        settings: {
          recordingEnabled: user.recordingEnabled ?? true,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Crossed Paths recording settings
 * @route   PUT /api/crossed-paths/settings
 * @access  Private
 */
export const updateCrossedPathsSettings = async (req, res, next) => {
  try {
    const { recordingEnabled } = req.body;
    const user = await User.findById(req.user._id);

    if (recordingEnabled !== undefined) {
      user.recordingEnabled = Boolean(recordingEnabled);
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: {
        settings: {
          recordingEnabled: user.recordingEnabled,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear all caller's own encounters
 * @route   DELETE /api/crossed-paths
 * @access  Private
 */
export const clearCrossedPaths = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    await Encounter.deleteMany({ ownerUserId: viewerId });

    res.status(200).json({
      success: true,
      message: 'All crossed paths encounters cleared.',
    });
  } catch (error) {
    next(error);
  }
};
