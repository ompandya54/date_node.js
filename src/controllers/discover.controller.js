import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import { canSee, formatPublicProfile } from '../utils/shared.utils.js';
import { NearbySession } from '../models/nearby.model.js';
import { PlaceSession } from '../models/place.model.js';
import Encounter from '../models/encounter.model.js';
import { createNotification } from '../utils/notification.utils.js';

/**
 * @desc    Get discovery feed profiles (cursor-based pagination)
 * @route   GET /api/discover/profiles
 * @access  Private
 */
export const getDiscoverProfiles = async (req, res, next) => {
  try {
    const viewer = await User.findById(req.user._id);
    const { cursor, pageSize = 10 } = req.query;

    const limitNum = Math.min(Math.max(parseInt(pageSize) || 10, 1), 30);

    // Collect IDs to exclude
    const excludeIds = [
      viewer._id,
      ...(viewer.actedOn || []),
      ...(viewer.likes || []),
      ...(viewer.passes || []),
      ...(viewer.blockedUsers || []),
    ];

    const query = {
      _id: { $nin: excludeIds },
      isActive: true,
      onboardingCompleted: true,
      hideProfile: false,
      gender: { $in: viewer.interestedIn || ['woman', 'man', 'nonBinary'] },
      interestedIn: viewer.gender || 'man',
    };

    if (cursor) {
      try {
        const decodedDate = new Date(Buffer.from(cursor, 'base64').toString('ascii'));
        if (!isNaN(decodedDate.getTime())) {
          query.createdAt = { $lt: decodedDate };
        }
      } catch {}
    }

    // Keyset pagination ordered stably by createdAt desc
    const candidates = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum + 1)
      .lean();

    const hasMore = candidates.length > limitNum;
    const itemsToReturn = hasMore ? candidates.slice(0, limitNum) : candidates;

    // Filter using single shared canSee function
    const visibleProfiles = itemsToReturn
      .filter((candidate) => canSee(viewer, candidate, true))
      .map((candidate) => formatPublicProfile(candidate, viewer));

    let nextCursor = null;
    if (hasMore && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = Buffer.from(new Date(lastItem.createdAt).toISOString()).toString('base64');
    }

    res.status(200).json({
      success: true,
      data: {
        items: visibleProfiles,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed public profile of a single user
 * @route   GET /api/discover/profiles/:id
 * @access  Private
 */
export const getDiscoverProfileById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const viewer = await User.findById(req.user._id);
    const candidate = await User.findById(id).lean();

    if (!candidate || !candidate.isActive) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found.',
      });
    }

    // Check if viewer has legitimate relationship with candidate
    const isDirectlyVisible = canSee(viewer, candidate, false);
    const isMatched = await Match.findOne({ users: { $all: [viewer._id, candidate._id] } });
    const likedMe = (candidate.likes || []).some((uid) => uid.toString() === viewer._id.toString());

    // Check active Nearby or Place or Encounter link
    const nearbyLink = await NearbySession.findOne({ userId: candidate._id });
    const placeLink = await PlaceSession.findOne({ userId: candidate._id });
    const encounterLink = await Encounter.findOne({
      ownerUserId: viewer._id,
      otherUserId: candidate._id,
    });

    const hasRelationship = isMatched || likedMe || nearbyLink || placeLink || encounterLink;

    if (!isDirectlyVisible && !hasRelationship) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found.',
      });
    }

    // Block check
    const viewerBlocked = (viewer.blockedUsers || []).map((b) => b.toString());
    const candidateBlocked = (candidate.blockedUsers || []).map((b) => b.toString());
    if (viewerBlocked.includes(candidate._id.toString()) || candidateBlocked.includes(viewer._id.toString())) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        profile: formatPublicProfile(candidate, viewer),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Like a profile (Right Swipe)
 * @route   POST /api/discover/likes
 * @access  Private
 */
export const likeProfile = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    const viewer = await User.findById(req.user._id);

    if (!profileId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'profileId is required.',
      });
    }

    const candidate = await User.findById(profileId);
    if (!candidate || !candidate.isActive || candidate.hideProfile) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found or hidden.',
      });
    }

    // Block check
    const viewerBlocked = (viewer.blockedUsers || []).map((b) => b.toString());
    const candidateBlocked = (candidate.blockedUsers || []).map((b) => b.toString());
    if (viewerBlocked.includes(profileId) || candidateBlocked.includes(viewer._id.toString())) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found.',
      });
    }

    // Idempotent recording of like and actedOn
    const alreadyLiked = (viewer.likes || []).some((id) => id.toString() === profileId);
    if (!alreadyLiked) {
      viewer.likes.push(profileId);
    }
    if (!(viewer.actedOn || []).some((id) => id.toString() === profileId)) {
      viewer.actedOn.push(profileId);
    }
    await viewer.save();

    // Check if candidate already liked viewer (Mutual Match)
    const candidateLikedMe = (candidate.likes || []).some(
      (id) => id.toString() === viewer._id.toString()
    );

    if (candidateLikedMe) {
      let match = await Match.findOne({
        users: { $all: [viewer._id, candidate._id] },
      });

      if (!match) {
        match = await Match.create({
          users: [viewer._id, candidate._id],
          matchedAt: new Date(),
          seenBy: [],
        });

        if (!viewer.matches.includes(candidate._id)) {
          viewer.matches.push(candidate._id);
          await viewer.save();
        }
        if (!candidate.matches.includes(viewer._id)) {
          candidate.matches.push(viewer._id);
          await candidate.save();
        }
      }

      // Notifications on match (for both participants)
      const io = req.app.get('io');
      await createNotification({
        userId: viewer._id,
        type: 'newMatch',
        eventId: `match_${match._id}_${viewer._id}`,
        profileId: candidate._id.toString(),
        matchId: match._id.toString(),
        name: candidate.name || '',
        io,
      });

      await createNotification({
        userId: candidate._id,
        type: 'newMatch',
        eventId: `match_${match._id}_${candidate._id}`,
        profileId: viewer._id.toString(),
        matchId: match._id.toString(),
        name: viewer.name || '',
        io,
      });

      return res.status(200).json({
        success: true,
        data: {
          outcome: 'matched',
          matchId: match._id.toString(),
        },
      });
    }

    // Single Like notification (to candidate, generic text with no name/photo)
    await createNotification({
      userId: candidate._id,
      type: 'newLike',
      eventId: `like_${viewer._id}_${candidate._id}`,
      profileId: viewer._id.toString(),
      io: req.app.get('io'),
    });

    res.status(200).json({
      success: true,
      data: {
        outcome: 'liked',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Pass a profile (Left Swipe)
 * @route   POST /api/discover/passes
 * @access  Private
 */
export const passProfile = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    const viewer = await User.findById(req.user._id);

    if (!profileId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'profileId is required.',
      });
    }

    const candidate = await User.findById(profileId);
    if (!candidate || !candidate.isActive || candidate.hideProfile) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found or hidden.',
      });
    }

    if (!(viewer.passes || []).some((id) => id.toString() === profileId)) {
      viewer.passes.push(profileId);
    }
    if (!(viewer.actedOn || []).some((id) => id.toString() === profileId)) {
      viewer.actedOn.push(profileId);
    }
    await viewer.save();

    res.status(200).json({
      success: true,
      message: 'Profile passed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get profiles that liked the viewer (Likes You screen)
 * @route   GET /api/likes-you
 * @access  Private
 */
export const getLikesYou = async (req, res, next) => {
  try {
    const viewer = await User.findById(req.user._id);

    const actedOnIds = (viewer.actedOn || []).map((id) => id.toString());
    const blockedIds = (viewer.blockedUsers || []).map((id) => id.toString());
    const matchedIds = (viewer.matches || []).map((id) => id.toString());

    // Find users who liked viewer
    const likers = await User.find({
      likes: viewer._id,
      isActive: true,
      onboardingCompleted: true,
      hideProfile: false,
      _id: { $nin: [...blockedIds, ...actedOnIds, ...matchedIds] },
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const items = likers
      .filter((user) => canSee(viewer, user, false))
      .map((user) => {
        const photoUrl = user.photos && user.photos.length > 0
          ? (typeof user.photos[0] === 'object' ? user.photos[0].url : user.photos[0])
          : '';

        return {
          profileId: user._id.toString(),
          name: user.name || '',
          age: user.age || 0,
          photoUrl,
          likedAt: user.updatedAt,
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
