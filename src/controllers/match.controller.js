import User from '../models/user.model.js';
import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import UserAction from '../models/userAction.model.js';
import Block from '../models/block.model.js';

/**
 * @desc    Get user's active matches
 * @route   GET /api/matches
 * @access  Private
 */
export const getMatches = async (req, res, next) => {
  try {
    const viewer = req.user;

    const rawMatches = await Match.find({ users: viewer._id })
      .sort({ matchedAt: -1 })
      .limit(200);

    if (rawMatches.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
        },
      });
    }

    // Get partner user IDs
    const partnerIds = rawMatches.map((m) =>
      m.users.find((uId) => uId.toString() !== viewer._id.toString())
    );

    // Get blocked users
    const blocks = await Block.find({
      $or: [{ blockerId: viewer._id }, { blockedId: viewer._id }],
    });
    const blockedUserIds = new Set(
      blocks.map((b) => (b.blockerId.toString() === viewer._id.toString() ? b.blockedId.toString() : b.blockerId.toString()))
    );

    // Fetch partner user profiles
    const partners = await User.find({
      _id: { $in: partnerIds, $nin: Array.from(blockedUserIds) },
      isActive: { $ne: false },
    });
    const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

    const items = [];
    for (const matchDoc of rawMatches) {
      const partnerIdStr = matchDoc.users
        .find((uId) => uId.toString() !== viewer._id.toString())
        ?.toString();

      const partner = partnerIdStr ? partnerMap.get(partnerIdStr) : null;

      if (partner) {
        const photoUrl = partner.photos && partner.photos.length > 0
          ? (typeof partner.photos[0] === 'object' ? partner.photos[0].url : partner.photos[0])
          : '';

        const isNew = !matchDoc.seenBy.some((id) => id.toString() === viewer._id.toString());

        items.push({
          matchId: matchDoc._id.toString(),
          profileId: partner._id.toString(),
          name: partner.name || '',
          age: partner.age || null,
          photoUrl,
          matchedAt: matchDoc.matchedAt ? matchDoc.matchedAt.toISOString() : matchDoc.createdAt.toISOString(),
          isNew,
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

/**
 * @desc    Mark match as seen by current user
 * @route   POST /api/matches/:matchId/seen
 * @access  Private
 */
export const markMatchSeen = async (req, res, next) => {
  try {
    const viewer = req.user;
    const { matchId } = req.params;

    if (!matchId || matchId.length !== 24) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found',
      });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: viewer._id,
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found',
      });
    }

    const alreadySeen = match.seenBy.some((id) => id.toString() === viewer._id.toString());
    if (!alreadySeen) {
      match.seenBy.push(viewer._id);
      await match.save();
    }

    res.status(200).json({
      success: true,
      message: 'Match marked as seen',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unmatch user (deletes match & conversation, records acted-on)
 * @route   DELETE /api/matches/:matchId
 * @access  Private
 */
export const unmatchUser = async (req, res, next) => {
  try {
    const viewer = req.user;
    const { matchId } = req.params;

    if (!matchId || matchId.length !== 24) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found',
      });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: viewer._id,
    });

    if (!match) {
      // Idempotent return 200 if already deleted
      return res.status(200).json({
        success: true,
        message: 'Unmatched successfully',
      });
    }

    const partnerId = match.users.find((uId) => uId.toString() !== viewer._id.toString());

    // 1. Record UserAction type 'pass' for both sides so pair does not reappear in Discover
    if (partnerId) {
      await UserAction.findOneAndUpdate(
        { fromUserId: viewer._id, toUserId: partnerId },
        { type: 'pass' },
        { upsert: true }
      );
      await UserAction.findOneAndUpdate(
        { fromUserId: partnerId, toUserId: viewer._id },
        { type: 'pass' },
        { upsert: true }
      );
    }

    // 2. Delete chat messages and match document
    await Message.deleteMany({ matchId: match._id });
    await Match.findByIdAndDelete(match._id);

    res.status(200).json({
      success: true,
      message: 'Unmatched successfully',
    });
  } catch (error) {
    next(error);
  }
};
