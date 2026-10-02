import Message from '../models/message.model.js';
import Match from '../models/match.model.js';
import { canUserSendChat } from '../utils/planHelper.js';

/**
 * @desc    Get chat message history for a match
 * @route   GET /api/chat/:matchId
 * @access  Private
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;

    const match = await Match.findOne({
      _id: matchId,
      users: userId,
    });

    if (!match) {
      return res.status(403).json({
        success: false,
        message: 'Match not found or access denied',
      });
    }

    const messages = await Message.find({ matchId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name photos');

    res.status(200).json({
      success: true,
      count: messages.length,
      data: {
        messages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark unread messages as read
 * @route   PUT /api/chat/read/:matchId
 * @access  Private
 */
export const markMessagesAsRead = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;

    await Message.updateMany(
      { matchId, receiver: userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a message via HTTP endpoint (Enforces Free Weekend Promo & ₹39 Premium Chat Rule)
 * @route   POST /api/chat/send
 * @access  Private
 */
export const sendMessageHTTP = async (req, res, next) => {
  try {
    const { matchId, text, mediaUrl } = req.body;
    const sender = req.user;

    // Check Plan & Free Weekend Chat permission
    const permission = canUserSendChat(sender);
    if (!permission.canChat) {
      return res.status(403).json({
        success: false,
        requiresUpgrade: true,
        message: permission.reason,
      });
    }

    if (!matchId || (!text && !mediaUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide matchId and message text or photo mediaUrl',
      });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: sender._id,
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found',
      });
    }

    const receiverId = match.users.find(
      (u) => u.toString() !== sender._id.toString()
    );

    const message = await Message.create({
      matchId,
      sender: sender._id,
      receiver: receiverId,
      text: text || '',
      mediaUrl: mediaUrl || '',
    });

    match.lastMessage = text || 'Sent a photo 📷';
    match.lastMessageSender = sender._id;
    match.lastMessageAt = new Date();
    await match.save();

    res.status(201).json({
      success: true,
      data: {
        message,
      },
    });
  } catch (error) {
    next(error);
  }
};
