import Message from '../models/message.model.js';
import Match from '../models/match.model.js';
import User from '../models/user.model.js';
import { canUserSendChat } from '../utils/planHelper.js';
import { createNotification } from '../utils/notification.utils.js';

// Fixed catalog of 5 icebreakers (Document 0 / B4)
export const ICEBREAKER_QUESTIONS = [
  { id: 'coffee_chai', options: ['a', 'b'] },
  { id: 'mountains_beach', options: ['a', 'b'] },
  { id: 'morning_night', options: ['a', 'b'] },
  { id: 'cats_dogs', options: ['a', 'b'] },
  { id: 'movies_books', options: ['a', 'b'] },
];

/**
 * Deterministically select 1 icebreaker question for a match
 */
export const getMatchIcebreakerQuestionId = (matchId) => {
  const hexTail = matchId.toString().slice(-4);
  const num = parseInt(hexTail, 16) || 0;
  return ICEBREAKER_QUESTIONS[num % ICEBREAKER_QUESTIONS.length].id;
};

/**
 * @desc    Get active conversations list
 * @route   GET /api/chat/conversations
 * @access  Private
 */
export const getConversations = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const matches = await Match.find({ users: viewerId })
      .populate('users', 'name photos isActive')
      .sort({ lastMessageAt: -1, matchedAt: -1 })
      .limit(200)
      .lean();

    const items = [];

    for (const match of matches) {
      const partner = (match.users || []).find(
        (u) => u._id.toString() !== viewerId.toString()
      );

      if (!partner || !partner.isActive) continue;

      const partnerPhotoUrl = partner.photos && partner.photos.length > 0
        ? (typeof partner.photos[0] === 'object' ? partner.photos[0].url : partner.photos[0])
        : '';

      const unreadCount = await Message.countDocuments({
        matchId: match._id,
        receiverId: viewerId,
        readByPartner: false,
      });

      items.push({
        matchId: match._id.toString(),
        partnerName: partner.name || '',
        partnerPhotoUrl,
        lastMessagePreview: match.lastMessageText || null,
        lastMessageAt: match.lastMessageAt || null,
        unreadCount,
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
 * @desc    Get messages for a conversation (paginated with cursor)
 * @route   GET /api/chat/:matchId/messages
 * @access  Private
 */
export const getMessages = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { limit = 50, before } = req.query;
    const viewerId = req.user._id;

    const match = await Match.findOne({ _id: matchId, users: viewerId });
    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found or access denied.',
      });
    }

    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

    const query = { matchId: match._id };
    if (before) {
      const beforeDate = new Date(Buffer.from(before, 'base64').toString('ascii'));
      if (!isNaN(beforeDate.getTime())) {
        query.sentAt = { $lt: beforeDate };
      }
    }

    const rawMessages = await Message.find(query)
      .sort({ sentAt: -1 })
      .limit(limitNum + 1)
      .lean();

    const hasMore = rawMessages.length > limitNum;
    const messages = hasMore ? rawMessages.slice(0, limitNum) : rawMessages;

    // Format messages oldest-first within page
    const items = messages.reverse().map((msg) => ({
      id: msg._id.toString(),
      matchId: msg.matchId.toString(),
      senderId: msg.senderId.toString(),
      senderIsMe: msg.senderId.toString() === viewerId.toString(),
      text: msg.text,
      sentAt: msg.sentAt || msg.createdAt,
      readByPartner: msg.readByPartner || false,
    }));

    let nextCursor = null;
    if (hasMore && rawMessages.length > 0) {
      const oldestInBatch = rawMessages[rawMessages.length - 1];
      nextCursor = Buffer.from(new Date(oldestInBatch.sentAt).toISOString()).toString('base64');
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
 * @desc    Send chat message via REST (idempotent with clientMessageId)
 * @route   POST /api/chat/:matchId/messages
 * @access  Private
 */
export const sendMessageREST = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { text, clientMessageId } = req.body;
    const viewerId = req.user._id;

    // Validate plan
    const chatPermission = canUserSendChat(req.user);
    if (!chatPermission.canChat) {
      return res.status(403).json({
        success: false,
        code: 'PREMIUM_REQUIRED',
        message: chatPermission.reason,
      });
    }

    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (!trimmedText || trimmedText.length > 1000) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Message text must be between 1 and 1000 characters.',
        errors: { text: 'Text must be between 1 and 1000 characters.' },
      });
    }

    const match = await Match.findOne({ _id: matchId, users: viewerId });
    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found or access denied.',
      });
    }

    const partnerId = match.users.find((id) => id.toString() !== viewerId.toString());

    // Idempotency check with clientMessageId
    if (clientMessageId) {
      const existingMessage = await Message.findOne({
        matchId,
        senderId: viewerId,
        clientMessageId,
      });

      if (existingMessage) {
        return res.status(200).json({
          success: true,
          data: {
            message: {
              id: existingMessage._id.toString(),
              matchId: existingMessage.matchId.toString(),
              senderId: existingMessage.senderId.toString(),
              senderIsMe: true,
              text: existingMessage.text,
              sentAt: existingMessage.sentAt,
              readByPartner: existingMessage.readByPartner,
            },
          },
        });
      }
    }

    const message = await Message.create({
      matchId,
      senderId: viewerId,
      receiverId: partnerId,
      text: trimmedText,
      clientMessageId: clientMessageId || null,
      sentAt: new Date(),
      readByPartner: false,
    });

    match.lastMessageText = trimmedText;
    match.lastMessageSender = viewerId;
    match.lastMessageAt = new Date();
    await match.save();

    const formattedMessage = {
      id: message._id.toString(),
      matchId: message.matchId.toString(),
      senderId: message.senderId.toString(),
      senderIsMe: true,
      text: message.text,
      sentAt: message.sentAt,
      readByPartner: false,
    };

    // Emit real-time message via socket if socket server attached
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`match_${matchId}`).emit('message_received', { message: formattedMessage });
      io.to(`user_${partnerId}`).emit('message_received', { message: formattedMessage });
    }

    // Trigger B5 notification for recipient (respects socket in-thread state & preferences)
    await createNotification({
      userId: partnerId,
      type: 'newMessage',
      eventId: `msg_${message._id.toString()}`,
      profileId: viewerId.toString(),
      matchId: matchId.toString(),
      name: req.user.name || '',
      io: req.app.get('io'),
    });

    res.status(201).json({
      success: true,
      data: {
        message: formattedMessage,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark conversation messages as read
 * @route   POST /api/chat/:matchId/read
 * @access  Private
 */
export const markChatRead = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const viewerId = req.user._id;

    const match = await Match.findOne({ _id: matchId, users: viewerId });
    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found.',
      });
    }

    const partnerId = match.users.find((id) => id.toString() !== viewerId.toString());

    await Message.updateMany(
      { matchId, receiverId: viewerId, readByPartner: false },
      { $set: { readByPartner: true } }
    );

    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`user_${partnerId}`).emit('messages_read', { matchId });
      io.to(`match_${matchId}`).emit('messages_read', { matchId });
    }

    res.status(200).json({
      success: true,
      message: 'Messages marked as read.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get deterministic icebreaker state for a match
 * @route   GET /api/chat/:matchId/icebreaker
 * @access  Private
 */
export const getMatchIcebreaker = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const viewerId = req.user._id.toString();

    const match = await Match.findOne({ _id: matchId, users: viewerId });
    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found.',
      });
    }

    const questionId = getMatchIcebreakerQuestionId(match._id);
    const partnerId = match.users.find((id) => id.toString() !== viewerId).toString();

    const answers = match.icebreaker?.answers || new Map();
    const myAnswer = answers.get ? answers.get(viewerId) || null : answers[viewerId] || null;
    const rawPartnerAnswer = answers.get ? answers.get(partnerId) || null : answers[partnerId] || null;

    const revealed = Boolean(myAnswer && rawPartnerAnswer);
    const partnerAnswer = revealed ? rawPartnerAnswer : null;

    res.status(200).json({
      success: true,
      data: {
        icebreaker: {
          questionId,
          myAnswer,
          partnerAnswer,
          revealed,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Answer deterministic icebreaker question
 * @route   POST /api/chat/:matchId/icebreaker
 * @access  Private
 */
export const answerMatchIcebreaker = async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const { questionId, optionId } = req.body;
    const viewerId = req.user._id.toString();

    const expectedQId = getMatchIcebreakerQuestionId(matchId);
    if (questionId !== expectedQId || !['a', 'b'].includes(optionId)) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Invalid questionId or optionId ("a" or "b").',
      });
    }

    const match = await Match.findOne({ _id: matchId, users: viewerId });
    if (!match) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Match not found.',
      });
    }

    const partnerId = match.users.find((id) => id.toString() !== viewerId).toString();

    if (!match.icebreaker) {
      match.icebreaker = { questionId: expectedQId, answers: new Map() };
    }

    const existingAnswer = match.icebreaker.answers.get
      ? match.icebreaker.answers.get(viewerId)
      : match.icebreaker.answers[viewerId];

    if (existingAnswer) {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_ANSWERED',
        message: 'You have already answered this icebreaker.',
      });
    }

    match.icebreaker.answers.set(viewerId, optionId);
    await match.save();

    const myAnswer = optionId;
    const rawPartnerAnswer = match.icebreaker.answers.get(partnerId) || null;
    const revealed = Boolean(myAnswer && rawPartnerAnswer);
    const partnerAnswer = revealed ? rawPartnerAnswer : null;

    if (revealed) {
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`user_${partnerId}`).emit('icebreaker_answered', { matchId });
        io.to(`match_${matchId}`).emit('icebreaker_answered', { matchId });
      }

      await createNotification({
        userId: partnerId,
        type: 'icebreakerAnswered',
        eventId: `ib_${matchId}_${expectedQId}`,
        profileId: viewerId,
        matchId,
        name: req.user.name || '',
        io: req.app.get('io'),
      });
    }

    res.status(200).json({
      success: true,
      data: {
        icebreaker: {
          questionId: expectedQId,
          myAnswer,
          partnerAnswer,
          revealed,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Legacy aliases for backwards compatibility
 */
export const getChatHistory = async (req, res, next) => {
  return getMessages(req, res, next);
};

export const sendMessageHTTP = async (req, res, next) => {
  if (!req.params.matchId && req.body.matchId) {
    req.params.matchId = req.body.matchId;
  }
  return sendMessageREST(req, res, next);
};

export const markMessagesAsRead = markChatRead;

