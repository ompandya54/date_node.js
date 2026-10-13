import jwt from 'jsonwebtoken';
import Message from '../models/message.model.js';
import Match from '../models/match.model.js';
import User from '../models/user.model.js';
import { canUserSendChat } from '../utils/planHelper.js';

// In-memory active thread tracking: Map of `${userId}_${matchId}` -> Set of socket IDs
const activeChatThreads = new Map();

// In-memory rate limiting map for legacy socket messages: userId -> Array of timestamps
const socketMsgTimestamps = new Map();

// Map of `${socket.id}_${matchId}` -> NodeJS.Timeout
const typingTimeouts = new Map();

/**
 * Check if a user currently has a chat thread open
 */
export const isUserInChatThread = (userId, matchId) => {
  if (!userId || !matchId) return false;
  const key = `${userId.toString()}_${matchId.toString()}`;
  const set = activeChatThreads.get(key);
  return Boolean(set && set.size > 0);
};

export const addUserToChatThread = (userId, matchId, socketId) => {
  const key = `${userId.toString()}_${matchId.toString()}`;
  if (!activeChatThreads.has(key)) {
    activeChatThreads.set(key, new Set());
  }
  activeChatThreads.get(key).add(socketId);
};

export const removeUserFromChatThread = (userId, matchId, socketId) => {
  const key = `${userId.toString()}_${matchId.toString()}`;
  if (activeChatThreads.has(key)) {
    activeChatThreads.get(key).delete(socketId);
    if (activeChatThreads.get(key).size === 0) {
      activeChatThreads.delete(key);
    }
  }
};

const isSocketRateLimited = (userId, maxPerMin = 30) => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  let timestamps = socketMsgTimestamps.get(userId) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= maxPerMin) {
    return true;
  }
  timestamps.push(now);
  socketMsgTimestamps.set(userId, timestamps);
  return false;
};

/**
 * Configure Socket.IO real-time dating chat module
 * @param {Server} io - Socket.IO Server Instance
 */
export const setupSocketIO = (io) => {
  io.on('connection', async (socket) => {
    // 1. Authenticate via token in handshake auth or headers
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      socket.emit('auth_error', { code: 'UNAUTHORIZED', message: 'Missing JWT token' });
      socket.disconnect(true);
      return;
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'gandhinagar_dating_jwt_secret_dev_2026'
      );
      const user = await User.findById(decoded.id);

      if (!user || !user.isActive) {
        socket.emit('auth_error', { code: 'UNAUTHORIZED', message: 'User not found or inactive' });
        socket.disconnect(true);
        return;
      }

      socket.user = user;
      const userRoom = `user_${user._id.toString()}`;
      socket.join(userRoom);
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      socket.emit('auth_error', {
        code: isExpired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
        message: isExpired ? 'Token has expired' : 'Invalid token',
      });
      socket.disconnect(true);
      return;
    }

    // 2. Client to Server: join_chat
    socket.on('join_chat', async ({ matchId }) => {
      try {
        if (!matchId) return;
        const match = await Match.findOne({
          _id: matchId,
          users: socket.user._id,
        });

        if (!match) {
          socket.emit('error_message', { code: 'NOT_FOUND', message: 'Match not found' });
          return;
        }

        const roomName = `match_${matchId}`;
        socket.join(roomName);
        addUserToChatThread(socket.user._id, matchId, socket.id);
      } catch (err) {
        console.error('[join_chat Error]:', err.message);
      }
    });

    // 3. Client to Server: leave_chat
    socket.on('leave_chat', ({ matchId }) => {
      if (matchId) {
        const roomName = `match_${matchId}`;
        socket.leave(roomName);
        removeUserFromChatThread(socket.user._id, matchId, socket.id);
      }
    });

    // 4. Client to Server: typing with 5-second auto-expiration
    socket.on('typing', async ({ matchId, isTyping }) => {
      try {
        if (!matchId) return;
        const match = await Match.findOne({
          _id: matchId,
          users: socket.user._id,
        });
        if (!match) return;

        const timeoutKey = `${socket.id}_${matchId}`;
        if (typingTimeouts.has(timeoutKey)) {
          clearTimeout(typingTimeouts.get(timeoutKey));
          typingTimeouts.delete(timeoutKey);
        }

        const typingVal = Boolean(isTyping);
        socket.to(`match_${matchId}`).emit('partner_typing', {
          matchId,
          isTyping: typingVal,
        });

        if (typingVal) {
          const timer = setTimeout(() => {
            socket.to(`match_${matchId}`).emit('partner_typing', {
              matchId,
              isTyping: false,
            });
            typingTimeouts.delete(timeoutKey);
          }, 5000);
          typingTimeouts.set(timeoutKey, timer);
        }
      } catch (err) {
        console.error('[typing Error]:', err.message);
      }
    });

    // 5. Legacy socket message sender (preserved until B9)
    socket.on('send_message', async (data) => {
      try {
        const userIdStr = socket.user._id.toString();

        if (isSocketRateLimited(userIdStr, 30)) {
          return socket.emit('error_message', {
            success: false,
            code: 'TOO_MANY_MESSAGES',
            message: 'You are sending messages too quickly. Please slow down.',
          });
        }

        const { matchId, text } = data;
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (!matchId || !trimmed || trimmed.length > 1000) {
          return socket.emit('error_message', {
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Message text must be between 1 and 1000 characters',
          });
        }

        const match = await Match.findOne({
          _id: matchId,
          users: socket.user._id,
        });

        if (!match) {
          return socket.emit('error_message', {
            success: false,
            code: 'NOT_FOUND',
            message: 'Match not found',
          });
        }

        const receiverId = match.users.find(
          (u) => u.toString() !== socket.user._id.toString()
        );

        const newMsg = await Message.create({
          matchId,
          senderId: socket.user._id,
          receiverId,
          text: trimmed,
          sentAt: new Date(),
          readByPartner: false,
        });

        match.lastMessageText = trimmed;
        match.lastMessageSender = socket.user._id;
        match.lastMessageAt = new Date();
        await match.save();

        const formattedMsg = {
          id: newMsg._id.toString(),
          matchId,
          senderId: socket.user._id.toString(),
          senderIsMe: false,
          text: newMsg.text,
          sentAt: newMsg.sentAt,
          readByPartner: false,
        };

        io.to(`match_${matchId}`).emit('message_received', { message: formattedMsg });
        io.to(`user_${receiverId}`).emit('message_received', { message: formattedMsg });
        socket.emit('message_received', { message: { ...formattedMsg, senderIsMe: true } });
        // Legacy event emit
        io.to(`match_${matchId}`).emit('receive_message', formattedMsg);
      } catch (err) {
        console.error('[Socket Send Error]:', err.message);
        socket.emit('error_message', {
          success: false,
          code: 'SERVER_ERROR',
          message: 'Failed to deliver message',
        });
      }
    });

    // 6. On Disconnect cleanup
    socket.on('disconnect', () => {
      // Clear typing timeouts and broadcast isTyping: false
      for (const [key, timer] of typingTimeouts.entries()) {
        if (key.startsWith(`${socket.id}_`)) {
          clearTimeout(timer);
          const matchId = key.split('_')[1];
          socket.to(`match_${matchId}`).emit('partner_typing', {
            matchId,
            isTyping: false,
          });
          typingTimeouts.delete(key);
        }
      }

      // Remove from all active chat threads
      for (const [key, socketSet] of activeChatThreads.entries()) {
        if (socketSet.has(socket.id)) {
          socketSet.delete(socket.id);
          if (socketSet.size === 0) {
            activeChatThreads.delete(key);
          }
        }
      }
    });
  });
};
