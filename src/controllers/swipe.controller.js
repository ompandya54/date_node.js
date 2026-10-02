import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import { calculateDistanceKm } from '../config/allowedCities.js';
import { checkAndResetDailyUsage, PLAN_LIMITS } from '../utils/planHelper.js';

/**
 * @desc    Get potential dating profiles list (Discovery Feed / Swipe Card Stack)
 * @route   GET /api/swipe/feed
 * @access  Private
 * @query   page, limit, minAge, maxAge, gender, maxDistance
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
      maxDistance = 50,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Collect IDs to exclude (Self, Already Liked, SuperLiked, Already Passed, Blocked Users)
    const excludeIds = [
      currentUser._id,
      ...(currentUser.likes || []),
      ...(currentUser.superLikes || []),
      ...(currentUser.passes || []),
      ...(currentUser.blockedUsers || []),
    ];

    // 1. Gender Filter: Target candidate's gender
    const genderQuery = {};
    if (gender) {
      genderQuery.gender = gender;
    } else if (currentUser.genderPreference !== 'everyone') {
      genderQuery.gender = currentUser.genderPreference;
    }

    // 2. Mutual Preference Filter: Candidate's preference must also match currentUser's gender
    const candidatePrefQuery = {
      $or: [
        { genderPreference: 'everyone' },
        { genderPreference: currentUser.gender },
      ],
    };

    // 3. Age Filter
    const ageQuery = {
      age: { $gte: parseInt(minAge), $lte: parseInt(maxAge) },
    };

    // Find profiles in database
    const profiles = await User.find({
      _id: { $nin: excludeIds },
      isActive: true,
      ...genderQuery,
      ...candidatePrefQuery,
      ...ageQuery,
    })
      .select('-likes -superLikes -passes -blockedUsers -reportedUsers')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const currentCoords = currentUser.location?.coordinates || [72.6369, 23.2156];

    // Format output with full profile details & distance calculation
    const feed = profiles
      .map((profile) => {
        const candidateCoords = profile.location?.coordinates || [72.6369, 23.2156];
        const distance = calculateDistanceKm(
          currentCoords[1],
          currentCoords[0],
          candidateCoords[1],
          candidateCoords[0]
        );

        return {
          id: profile._id.toString(),
          name: profile.name,
          age: profile.age,
          gender: profile.gender,
          bio: profile.bio || '',
          city: profile.city || 'Gandhinagar',
          state: profile.state || 'Gujarat',
          photos: profile.photos || [],
          interests: profile.interests || [],
          datingIntent: profile.datingIntent || 'Coffee date',
          distanceKm: Math.round(distance),
          isCityVerified: profile.isCityVerified || true,
          lastActive: profile.lastActive,
          createdAt: profile.createdAt,
        };
      })
      .filter((item) => item.distanceKm <= parseInt(maxDistance));

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
    const currentUser = req.user;

    const profile = await User.findById(id)
      .select('-likes -superLikes -passes -blockedUsers -reportedUsers')
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    const currentCoords = currentUser.location?.coordinates || [72.6369, 23.2156];
    const candidateCoords = profile.location?.coordinates || [72.6369, 23.2156];
    const distance = calculateDistanceKm(
      currentCoords[1],
      currentCoords[0],
      candidateCoords[1],
      candidateCoords[0]
    );

    res.status(200).json({
      success: true,
      data: {
        profile: {
          id: profile._id.toString(),
          name: profile.name,
          age: profile.age,
          gender: profile.gender,
          bio: profile.bio || '',
          city: profile.city || 'Gandhinagar',
          state: profile.state || 'Gujarat',
          photos: profile.photos || [],
          interests: profile.interests || [],
          datingIntent: profile.datingIntent || 'Coffee date',
          distanceKm: Math.round(distance),
          isCityVerified: profile.isCityVerified || true,
          lastActive: profile.lastActive,
          createdAt: profile.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Swipe Actions: Like, Pass, or SuperLike a user (Enforces daily swipe limits for Free vs ₹39 Premium)
 * @route   POST /api/swipe
 * @access  Private
 * @body    { targetUserId: "...", action: "like" | "pass" | "superlike", comment: "..." }
 */
export const swipeUser = async (req, res, next) => {
  try {
    const { targetUserId, action, comment } = req.body; // action: 'like', 'pass', 'superlike'

    if (!targetUserId || !['like', 'pass', 'superlike'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid targetUserId and action ("like", "pass", or "superlike")',
      });
    }

    const currentUser = await User.findById(req.user._id);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found',
      });
    }

    // Check and reset daily swipe counters at midnight
    await checkAndResetDailyUsage(currentUser);

    const userPlan = currentUser.plan || 'free';
    const limits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;

    // Enforce Daily Limits for Likes & Super Likes
    if (action === 'like' && currentUser.dailySwipeCount >= limits.maxDailyLikes) {
      return res.status(403).json({
        success: false,
        requiresUpgrade: true,
        message: `Daily Free swipe limit reached (${limits.maxDailyLikes}/day). Upgrade to Premium (₹39/month) for unlimited swipes!`,
      });
    }

    if (action === 'superlike' && currentUser.dailySuperLikeCount >= limits.maxDailySuperLikes) {
      return res.status(403).json({
        success: false,
        requiresUpgrade: true,
        message: `Daily Super Like limit reached (${limits.maxDailySuperLikes}/day). Upgrade to Premium (₹39/month) for 5 Super Likes daily!`,
      });
    }

    currentUser.lastSwipedUser = targetUserId;

    // --- Action 1: PASS ---
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

    // Increment Usage Counters for Like and SuperLike
    if (action === 'like') {
      currentUser.dailySwipeCount += 1;
    }
    if (action === 'superlike') {
      currentUser.dailySwipeCount += 1;
      currentUser.dailySuperLikeCount += 1;
    }

    // --- Action 2: SUPER LIKE ---
    if (action === 'superlike') {
      if (!currentUser.superLikes.includes(targetUserId)) {
        currentUser.superLikes.push(targetUserId);
      }
      if (!currentUser.likes.includes(targetUserId)) {
        currentUser.likes.push(targetUserId);
      }
    }

    // --- Action 3: NORMAL LIKE ---
    if (action === 'like') {
      if (!currentUser.likes.includes(targetUserId)) {
        currentUser.likes.push(targetUserId);
      }
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

      // Create initial message if comment provided
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
          matchedUser: {
            id: targetUser._id.toString(),
            name: targetUser.name,
            age: targetUser.age,
            photos: targetUser.photos,
            bio: targetUser.bio,
            city: targetUser.city,
            interests: targetUser.interests,
            datingIntent: targetUser.datingIntent,
          },
        },
      });
    }

    // --- Single-sided swipe WITH A COMMENT ---
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

    // Single-sided swipe without comment
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
        select: 'name email age photos bio city interests datingIntent lastActive',
      })
      .sort({ createdAt: -1 });

    const formattedRequests = requests.map((reqItem) => ({
      requestId: reqItem._id.toString(),
      comment: reqItem.comment,
      createdAt: reqItem.createdAt,
      sender: reqItem.requestedBy,
    }));

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
 * @desc    Respond (Accept or Decline) a pending match request with comment
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
        message: 'Pending request not found or already processed',
      });
    }

    const senderId = match.requestedBy;
    const currentUser = await User.findById(userId);
    const senderUser = await User.findById(senderId);

    if (action === 'decline') {
      match.status = 'rejected';
      await match.save();

      if (!currentUser.passes.includes(senderId)) {
        currentUser.passes.push(senderId);
        await currentUser.save();
      }

      return res.status(200).json({
        success: true,
        action: 'decline',
        message: 'Declined request',
      });
    }

    // Action is ACCEPT
    match.status = 'accepted';
    await match.save();

    if (!currentUser.matches.includes(senderId)) {
      currentUser.matches.push(senderId);
      await currentUser.save();
    }
    if (!senderUser.matches.includes(userId)) {
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
      message: `Request accepted! You and ${senderUser.name} are now matched! 🎉`,
      data: {
        matchId: match._id.toString(),
        matchedUser: {
          id: senderUser._id.toString(),
          name: senderUser.name,
          age: senderUser.age,
          photos: senderUser.photos,
          bio: senderUser.bio,
          city: senderUser.city,
          interests: senderUser.interests,
        },
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
 * @desc    Get user's mutual accepted matches list with unread counts for chat tab
 * @route   GET /api/swipe/matches
 * @access  Private
 */
export const getMatches = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const matches = await Match.find({ users: userId, status: 'accepted' })
      .populate({
        path: 'users',
        select: 'name email age photos bio city interests datingIntent lastActive',
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
          user: otherUser,
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
