import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import { canSee } from '../utils/shared.utils.js';
import { createNotification } from '../utils/notification.utils.js';
import { calculateDistanceKm } from '../config/allowedCities.js';

/**
 * Format a user profile specifically for the Flutter Discover card deck
 */
export const formatFeedCard = (candidate, viewer) => {
  // Photos array as strings
  const photos = (candidate.photos || [])
    .map((p) => (typeof p === 'object' && p !== null ? p.url : p))
    .filter(Boolean);

  // Interests as string array (e.g. ['coffee', 'travel'])
  const rawInterests = candidate.interestIds || candidate.interests || [];
  const interests = rawInterests.map((item) =>
    typeof item === 'object' && item !== null ? item.id || item.label : item
  );

  // Calculate distance or provide realistic coarse distance in Gandhinagar
  let distanceKm = 3.5;
  if (
    viewer?.location?.coordinates &&
    candidate?.location?.coordinates &&
    viewer.location.coordinates.length === 2 &&
    candidate.location.coordinates.length === 2
  ) {
    const [vLng, vLat] = viewer.location.coordinates;
    const [cLng, cLat] = candidate.location.coordinates;
    if (vLat && vLng && cLat && cLng) {
      distanceKm = Math.round(calculateDistanceKm(vLat, vLng, cLat, cLng) * 10) / 10;
    }
  } else if (candidate._id) {
    // Coarse realistic distance (1.5 - 4.5 km) based on candidate ID hash
    const hashByte = parseInt(candidate._id.toString().slice(-2), 16) || 0;
    distanceKm = Math.round((1.5 + (hashByte % 30) / 10) * 10) / 10;
  }

  return {
    id: candidate._id ? candidate._id.toString() : candidate.id,
    name: candidate.name || '',
    age: candidate.age || 22,
    bio: candidate.bio || '',
    photos,
    photoUrls: photos, // Dual compatibility
    interests,
    datingIntent: candidate.datingIntent || 'longTermRelationship',
    distanceKm,
    gender: candidate.gender || 'woman',
  };
};

/**
 * @desc    Get Discover Feed profiles for swipe deck
 * @route   GET /api/feed
 * @access  Private
 */
export const getFeed = async (req, res, next) => {
  try {
    const viewer = await User.findById(req.user._id);
    const { limit = 10, pageSize, cursor } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit || pageSize) || 10, 1), 30);

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
    };

    if (viewer.interestedIn && viewer.interestedIn.length > 0) {
      query.gender = { $in: viewer.interestedIn };
    }
    if (viewer.gender) {
      query.interestedIn = viewer.gender;
    }

    if (cursor) {
      try {
        const decodedDate = new Date(Buffer.from(cursor, 'base64').toString('ascii'));
        if (!isNaN(decodedDate.getTime())) {
          query.createdAt = { $lt: decodedDate };
        }
      } catch {}
    }

    const candidates = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum + 1)
      .lean();

    const hasMore = candidates.length > limitNum;
    const itemsToReturn = hasMore ? candidates.slice(0, limitNum) : candidates;

    const visibleCandidates = itemsToReturn.filter((candidate) => canSee(viewer, candidate, true));
    const items = visibleCandidates.map((candidate) => formatFeedCard(candidate, viewer));

    let nextCursor = null;
    if (hasMore && itemsToReturn.length > 0) {
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = Buffer.from(new Date(lastItem.createdAt).toISOString()).toString('base64');
    }

    res.status(200).json({
      success: true,
      data: {
        items,
        nextCursor,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Like a profile in feed (Right Swipe)
 * @route   POST /api/feed/:id/like or POST /api/feed/like
 * @access  Private
 */
export const likeFeedProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id || req.body.profileId || req.body.id;
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
          isMatch: true,
          matchId: match._id.toString(),
          outcome: 'matched',
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
        isMatch: false,
        matchId: null,
        outcome: 'liked',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Pass a profile in feed (Left Swipe)
 * @route   POST /api/feed/:id/pass or POST /api/feed/pass
 * @access  Private
 */
export const passFeedProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id || req.body.profileId || req.body.id;
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
      data: {
        outcome: 'passed',
      },
    });
  } catch (error) {
    next(error);
  }
};

