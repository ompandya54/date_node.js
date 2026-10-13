import User from '../models/user.model.js';
import UserAction from '../models/userAction.model.js';
import Match from '../models/match.model.js';
import Block from '../models/block.model.js';

/**
 * @desc    Get profiles who liked the viewer
 * @route   GET /api/likes-you
 * @access  Private
 */
export const getLikesYou = async (req, res, next) => {
  try {
    const viewer = req.user;

    // 1. Get user actions where toUserId === viewer._id and type === 'like'
    const incomingLikes = await UserAction.find({ toUserId: viewer._id, type: 'like' })
      .sort({ createdAt: -1 })
      .limit(100);

    if (incomingLikes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
        },
      });
    }

    const likerUserIds = incomingLikes.map((l) => l.fromUserId);

    // 2. Get IDs of users already acted-on (liked or passed) by viewer
    const myActions = await UserAction.find({ fromUserId: viewer._id }).select('toUserId');
    const myActedOnUserIds = new Set(myActions.map((a) => a.toUserId.toString()));

    // 3. Get IDs of blocked users (both directions)
    const blocks = await Block.find({
      $or: [{ blockerId: viewer._id }, { blockedId: viewer._id }],
    });
    const blockedUserIds = new Set(
      blocks.map((b) => (b.blockerId.toString() === viewer._id.toString() ? b.blockedId.toString() : b.blockerId.toString()))
    );

    // 4. Get IDs of existing matched users
    const matches = await Match.find({ users: viewer._id }).select('users');
    const matchedUserIds = new Set();
    matches.forEach((m) => {
      m.users.forEach((uId) => {
        if (uId.toString() !== viewer._id.toString()) {
          matchedUserIds.add(uId.toString());
        }
      });
    });

    const excludeIds = new Set([...myActedOnUserIds, ...blockedUserIds, ...matchedUserIds]);

    // Filter valid likers
    const filteredLikerDocs = await User.find({
      _id: { $in: likerUserIds, $nin: Array.from(excludeIds) },
      onboardingCompleted: true,
      hideProfile: { $ne: true },
      isActive: { $ne: false },
    });

    const likerMap = new Map(filteredLikerDocs.map((u) => [u._id.toString(), u]));

    const items = [];
    for (const likeRecord of incomingLikes) {
      const likerIdStr = likeRecord.fromUserId.toString();
      const liker = likerMap.get(likerIdStr);

      if (liker) {
        const photoUrl = liker.photos && liker.photos.length > 0
          ? (typeof liker.photos[0] === 'object' ? liker.photos[0].url : liker.photos[0])
          : '';

        items.push({
          profileId: liker._id.toString(),
          name: liker.name || '',
          age: liker.age || null,
          photoUrl,
          likedAt: likeRecord.createdAt.toISOString(),
        });
      }
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
