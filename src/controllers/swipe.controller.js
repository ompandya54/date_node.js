import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import { checkAndResetDailyUsage, PLAN_LIMITS } from '../utils/planHelper.js';

/**
 * Helper to compute human-readable last active status string (without distance/coordinates)
 */
export const formatProfileActivityInfo = (candidate) => {
  let lastActiveText = 'Recently active';
  if (candidate?.lastActive) {
    const diffMs = new Date() - new Date(candidate.lastActive);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 5) {
      lastActiveText = 'Active now';
    } else if (diffMins < 60) {
      lastActiveText = `Active ${diffMins} mins ago`;
    } else if (diffHours < 24) {
      lastActiveText = `Active ${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      lastActiveText = `Active ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
  }

  return {
    lastActiveText,
  };
};

/**
 * Format user profile response payload strictly enforcing location privacy
 */
export const formatCleanProfile = (profile) => {
  if (!profile) return null;
  const activity = formatProfileActivityInfo(profile);
  return {
    id: profile._id ? profile._id.toString() : profile.id,
    name: profile.name || '',
    age: profile.age || null,
    gender: profile.gender || null,
    bio: profile.bio || '',
    city: profile.city || 'Gandhinagar',
    state: profile.state || 'Gujarat',
    photos: profile.photos || [],
    interests: profile.interests || [],
    datingIntent: profile.datingIntent || 'Coffee date',
    isCityVerified: profile.isCityVerified !== undefined ? profile.isCityVerified : true,
    ...activity,
    lastActive: profile.lastActive,
    createdAt: profile.createdAt,
  };
};

/**
 * @desc    Get potential dating profiles list (Discovery Feed / Swipe Card Stack)
 * @route   GET /api/swipe/feed
 * @access  Private
 * @query   page, limit, minAge, maxAge, gender, maxDistance (ignored)
 */
export const getDiscoveryFeed = async (req, res, next) => {
  try {
    const currentUser = req.user;
    const {
      page = 1,
      limit = 20,
      minAge = 18,
      maxAge = 100,
      gender,
      // maxDistance is ignored per Product Decision 0.2
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Collect IDs to exclude
    const excludeIds = [
      currentUser._id,
      ...(currentUser.likes || []),
      ...(currentUser.superLikes || []),
      ...(currentUser.passes || []),
      ...(currentUser.blockedUsers || []),
    ];

    // 1. Gender Filter
    const genderQuery = {};
    if (gender) {
      genderQuery.gender = gender;
    } else if (currentUser.genderPreference && currentUser.genderPreference !== 'everyone') {
      genderQuery.gender = currentUser.genderPreference;
    }

    // 2. Mutual Preference Filter
    const candidatePrefQuery = currentUser.gender
      ? {
          $or: [
            { genderPreference: 'everyone' },
            { genderPreference: currentUser.gender },
          ],
        }
      : {};

    // 3. Age Filter
    const ageQuery = {
      age: { $gte: parseInt(minAge), $lte: parseInt(maxAge) },
    };

    // Find profiles in database
    const profiles = await User.find({
      _id: { $nin: excludeIds },
      isActive: true,
      onboardingCompleted: true,
      ...genderQuery,
      ...candidatePrefQuery,
      ...ageQuery,
    })
      .select('-likes -superLikes -passes -blockedUsers -reportedUsers')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const feed = profiles.map((profile) => formatCleanProfile(profile));

    res.status(200).json({
      success: true,
      page: pageNum,
      limit: limitNum,
      count: feed.length,
      data: {
        profiles: feed,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get complete details of a single user profile
 * @route   GET /api/swipe/user/:id
 * @access  Private
 */
export const getSingleUserProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    const profile = await User.findById(id)
      .select('-likes -superLikes -passes -blockedUsers -reportedUsers')
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Profile not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        profile: formatCleanProfile(profile),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Swipe Actions: Like, Pass, or SuperLike a user
 * @route   POST /api/swipe
 * @access  Private
 */
export const swipeUser = async (req, res, next) => {
  try {
    const { targetUserId, action, comment } = req.body;

    if (!targetUserId || !['like', 'pass', 'superlike'].includes(action)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Please provide valid targetUserId and action ("like", "pass", or "superlike")',
      });
    }

    const currentUser = await User.findById(req.user._id);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Target user not found',
      });
    }

    await checkAndResetDailyUsage(currentUser);

    const isPremiumEnforced = process.env.PREMIUM_ENFORCEMENT === 'true';
    if (isPremiumEnforced) {
      const userPlan = currentUser.plan || 'free';
      const limits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;

      if (action === 'like' && currentUser.dailySwipeCount >= limits.maxDailyLikes) {
        return res.status(403).json({
          success: false,
          code: 'LIMIT_REACHED',
          requiresUpgrade: true,
          message: `Daily Free swipe limit reached (${limits.maxDailyLikes}/day). Upgrade to Premium for unlimited swipes!`,
        });
      }

      if (action === 'superlike' && currentUser.dailySuperLikeCount >= limits.maxDailySuperLikes) {
        return res.status(403).json({
          success: false,
          code: 'LIMIT_REACHED',
          requiresUpgrade: true,
          message: `Daily Super Like limit reached (${limits.maxDailySuperLikes}/day). Upgrade to Premium for 5 Super Likes daily!`,
        });
      }
    }

    currentUser.lastSwipedUser = targetUserId;

    if (action === 'pass') {
      if (!currentUser.passes.includes(targetUserId)) {
        currentUser.passes.push(targetUserId);
        await currentUser.save();
      }

      return res.status(200).json({
        success: true,
        action: 'pass',
        isMatch: false,
        message: 'Passed user',
      });
    }

    currentUser.dailySwipeCount += 1;
    if (action === 'superlike') {
      currentUser.dailySuperLikeCount += 1;
      if (!currentUser.superLikes.includes(targetUserId)) {
        currentUser.superLikes.push(targetUserId);
      }
    }

    if (!currentUser.likes.includes(targetUserId)) {
      currentUser.likes.push(targetUserId);
    }

    // Check if Mutual Match occurred
    const isMutual =
      targetUser.likes.includes(currentUser._id.toString()) ||
      targetUser.superLikes.includes(currentUser._id.toString());

    if (isMutual) {
      if (!currentUser.matches.includes(targetUserId)) {
        currentUser.matches.push(targetUserId);
      }
      if (!targetUser.matches.includes(currentUser._id)) {
        targetUser.matches.push(currentUser._id);
        await targetUser.save();
      }

      await currentUser.save();

      let match = await Match.findOne({
        users: { $all: [currentUser._id, targetUserId] },
      });

      if (!match) {
        match = await Match.create({
          users: [currentUser._id, targetUserId],
          status: 'accepted',
          comment: comment || '',
          requestedBy: currentUser._id,
          requestedTo: targetUserId,
          lastMessage: comment || `You matched with ${targetUser.name}! Say hi 👋`,
        });
      } else {
        match.status = 'accepted';
        if (comment) match.comment = comment;
        await match.save();
      }

      if (comment) {
        await Message.create({
          matchId: match._id,
          sender: currentUser._id,
          receiver: targetUserId,
          text: comment,
        });
      }

      return res.status(200).json({
        success: true,
        action,
        isMatch: true,
        isSuperLike: action === 'superlike',
        message: `It's a Match! You and ${targetUser.name} connected! 🎉`,
        data: {
          matchId: match._id.toString(),
          matchedUser: formatCleanProfile(targetUser),
        },
      });
    }

    if (comment && comment.trim().length > 0) {
      await currentUser.save();

      const pendingMatch = await Match.create({
        users: [currentUser._id, targetUserId],
        status: 'pending',
        comment: comment.trim(),
        requestedBy: currentUser._id,
        requestedTo: targetUserId,
        lastMessage: comment.trim(),
      });

      return res.status(200).json({
        success: true,
        action,
        isMatch: false,
        isPendingRequest: true,
        message: `Comment request sent to ${targetUser.name}! Waiting for them to accept.`,
        data: {
          requestId: pendingMatch._id.toString(),
          comment: pendingMatch.comment,
        },
      });
    }

    await currentUser.save();

    res.status(200).json({
      success: true,
      action,
      isMatch: false,
      isSuperLike: action === 'superlike',
      message: action === 'superlike' ? '⭐ Super Liked user!' : 'Liked user',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get incoming pending match requests with comments
 * @route   GET /api/swipe/requests
 * @access  Private
 */
export const getPendingRequests = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const requests = await Match.find({
      requestedTo: userId,
      status: 'pending',
    })
      .populate({
        path: 'requestedBy',
        select: 'name email age photos bio city state interests datingIntent lastActive',
      })
      .sort({ createdAt: -1 });

    const formattedRequests = requests.map((reqItem) => {
      const sender = reqItem.requestedBy ? reqItem.requestedBy.toObject() : {};
      return {
        requestId: reqItem._id.toString(),
        comment: reqItem.comment,
        createdAt: reqItem.createdAt,
        sender: formatCleanProfile(sender),
      };
    });

    res.status(200).json({
      success: true,
      count: formattedRequests.length,
      data: {
        requests: formattedRequests,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Respond (Accept or Decline) a pending match request
 * @route   POST /api/swipe/respond
 * @access  Private
 */
export const respondToMatchRequest = async (req, res, next) => {
  try {
    const { requestId, action } = req.body;
    const userId = req.user._id;

    if (!requestId || !['accept', 'decline'].includes(action)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Please provide valid requestId and action ("accept" or "decline")',
      });
    }

    const match = await Match.findOne({
      _id: requestId,
      requestedTo: userId,
      status: 'pending',
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Pending request not found or already processed',
      });
    }

    const senderId = match.requestedBy;
    const currentUser = await User.findById(userId);
    const senderUser = await User.findById(senderId);

    if (action === 'decline') {
      match.status = 'rejected';
      await match.save();

      if (currentUser && !currentUser.passes.includes(senderId)) {
        currentUser.passes.push(senderId);
        await currentUser.save();
      }

      return res.status(200).json({
        success: true,
        action: 'decline',
        message: 'Declined request',
      });
    }

    match.status = 'accepted';
    await match.save();

    if (currentUser && !currentUser.matches.includes(senderId)) {
      currentUser.matches.push(senderId);
      await currentUser.save();
    }
    if (senderUser && !senderUser.matches.includes(userId)) {
      senderUser.matches.push(userId);
      await senderUser.save();
    }

    if (match.comment) {
      await Message.create({
        matchId: match._id,
        sender: senderId,
        receiver: userId,
        text: match.comment,
      });
    }

    res.status(200).json({
      success: true,
      action: 'accept',
      isMatch: true,
      message: `Request accepted! You and ${senderUser ? senderUser.name : 'user'} are now matched! 🎉`,
      data: {
        matchId: match._id.toString(),
        matchedUser: formatCleanProfile(senderUser),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Undo / Rewind ONLY the immediate last swipe
 * @route   POST /api/swipe/undo
 * @access  Private
 */
export const undoLastSwipe = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user._id);

    if (!currentUser.lastSwipedUser) {
      return res.status(400).json({
        success: false,
        code: 'NO_SWIPE_TO_UNDO',
        message: 'No recent swipe to undo. You can only rewind the immediate last swipe!',
      });
    }

    const lastSwipedId = currentUser.lastSwipedUser.toString();

    currentUser.likes = currentUser.likes.filter((id) => id.toString() !== lastSwipedId);
    currentUser.superLikes = currentUser.superLikes.filter((id) => id.toString() !== lastSwipedId);
    currentUser.passes = currentUser.passes.filter((id) => id.toString() !== lastSwipedId);
    currentUser.lastSwipedUser = null;

    await currentUser.save();

    res.status(200).json({
      success: true,
      message: 'Successfully undone last swipe! Profile is restored back to your feed.',
      data: {
        restoredUserId: lastSwipedId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unmatch a user
 * @route   DELETE /api/swipe/unmatch/:matchId
 * @access  Private
 */
export const unmatchUser = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;

    const match = await Match.findOne({ _id: matchId, users: userId });
    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found or access denied',
      });
    }

    const otherUserId = match.users.find(
      (id) => id.toString() !== userId.toString()
    );

    await User.findByIdAndUpdate(userId, { $pull: { matches: otherUserId } });
    await User.findByIdAndUpdate(otherUserId, { $pull: { matches: userId } });

    await Match.findByIdAndDelete(matchId);
    await Message.deleteMany({ matchId });

    res.status(200).json({
      success: true,
      message: 'Successfully unmatched user',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's mutual accepted matches list with unread counts
 * @route   GET /api/swipe/matches
 * @access  Private
 */
export const getMatches = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const matches = await Match.find({ users: userId, status: 'accepted' })
      .populate({
        path: 'users',
        select: 'name email age photos bio city state interests datingIntent lastActive',
      })
      .sort({ updatedAt: -1 });

    const formattedMatches = await Promise.all(
      matches.map(async (match) => {
        const otherUser = match.users.find(
          (u) => u._id.toString() !== userId.toString()
        );

        const unreadCount = await Message.countDocuments({
          matchId: match._id,
          receiver: userId,
          isRead: false,
        });

        return {
          matchId: match._id.toString(),
          lastMessage: match.lastMessage,
          lastMessageAt: match.lastMessageAt,
          unreadCount,
          user: formatCleanProfile(otherUser),
        };
      })
    );

    res.status(200).json({
      success: true,
      count: formattedMatches.length,
      data: {
        matches: formattedMatches,
      },
    });
  } catch (error) {
    next(error);
  }
};
