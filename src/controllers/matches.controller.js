import Match from '../models/match.model.js';
import Message from '../models/message.model.js';
import User from '../models/user.model.js';

/**
 * @desc    Get active matches list
 * @route   GET /api/matches
 * @access  Private
 */
export const getMatches = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const matches = await Match.find({ users: viewerId })
      .populate('users', 'name age photos isActive hideProfile blockedUsers')
      .sort({ matchedAt: -1 })
      .limit(200)
      .lean();

    const items = [];

    for (const match of matches) {
      const partner = (match.users || []).find(
        (u) => u._id.toString() !== viewerId.toString()
      );

      if (!partner || !partner.isActive) continue;

      const photoUrl = partner.photos && partner.photos.length > 0
        ? (typeof partner.photos[0] === 'object' ? partner.photos[0].url : partner.photos[0])
        : '';

      const seenBy = (match.seenBy || []).map((id) => id.toString());
      const isNew = !seenBy.includes(viewerId.toString());

      items.push({
        matchId: match._id.toString(),
        profileId: partner._id.toString(),
        name: partner.name || '',
        age: partner.age || 0,
        photoUrl,
        matchedAt: match.matchedAt || match.createdAt,
        isNew,
      });
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
 * @desc    Mark match as seen
 * @route   POST /api/matches/:matchId/seen
 * @access  Private
 */
export const markMatchSeen = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const viewerId = req.user._id;

    const match = await Match.findOne({
      _id: matchId,
      users: viewerId,
    });

    if (match) {
      const alreadySeen = (match.seenBy || []).some((id) => id.toString() === viewerId.toString());
      if (!alreadySeen) {
        match.seenBy.push(viewerId);
        await match.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Match marked as seen.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unmatch user (delete match & chat, record actedOn)
 * @route   DELETE /api/matches/:matchId
 * @access  Private
 */
export const unmatchUser = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const viewerId = req.user._id;

    const match = await Match.findOne({
      _id: matchId,
      users: viewerId,
    });

    if (match) {
      const partnerId = match.users.find((id) => id.toString() !== viewerId.toString());

      // Add to actedOn so they never reappear in Discover
      if (partnerId) {
        await User.findByIdAndUpdate(viewerId, {
          $addToSet: { actedOn: partnerId },
          $pull: { matches: partnerId },
        });
        await User.findByIdAndUpdate(partnerId, {
          $addToSet: { actedOn: viewerId },
          $pull: { matches: viewerId },
        });
      }

      // Delete match and conversation messages
      await Message.deleteMany({ matchId });
      await Match.findByIdAndDelete(matchId);
    }

    res.status(200).json({
      success: true,
      message: 'Successfully unmatched.',
    });
  } catch (error) {
    next(error);
  }
};
