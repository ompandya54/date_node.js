import jwt from 'jsonwebtoken';
import Message from '../models/message.model.js';
import Match from '../models/match.model.js';
import User from '../models/user.model.js';
import { canUserSendChat } from '../utils/planHelper.js';

/**
 * Configure Socket.IO real-time dating chat module
 * @param {Server} io - Socket.IO Server Instance
 */
export const setupSocketIO = (io) => {
  // Middleware: Authenticate Socket connections via JWT
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: Missing JWT token'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('[Socket Auth Error]:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`⚡ [Socket Connected] User: ${socket.user.name} (${socket.user._id})`);

    socket.on('join_chat', ({ matchId }) => {
      if (matchId) {
        const roomName = `match_${matchId}`;
        socket.join(roomName);
        console.log(`👤 User ${socket.user.name} joined room ${roomName}`);
      }
    });

    socket.on('leave_chat', ({ matchId }) => {
      if (matchId) {
        const roomName = `match_${matchId}`;
        socket.leave(roomName);
        console.log(`👤 User ${socket.user.name} left room ${roomName}`);
      }
    });

    // Event: Real-time Message sent (Enforces Plan & Weekend Chat rule)
    socket.on('send_message', async (data) => {
      try {
        const { matchId, text, mediaUrl } = data;

        // Check plan & Free Weekend Chat promo
        const chatPermission = canUserSendChat(socket.user);
        if (!chatPermission.canChat) {
          return socket.emit('error_message', {
            requiresUpgrade: true,
            message: chatPermission.reason,
          });
        }

        if (!matchId || (!text && !mediaUrl)) {
          return socket.emit('error_message', { message: 'Invalid message payload' });
        }

        const match = await Match.findOne({
          _id: matchId,
          users: socket.user._id,
        });

        if (!match) {
          return socket.emit('error_message', { message: 'Match access denied' });
        }

        const receiverId = match.users.find(
          (u) => u.toString() !== socket.user._id.toString()
        );

        const newMsg = await Message.create({
          matchId,
          sender: socket.user._id,
          receiver: receiverId,
          text: text || '',
          mediaUrl: mediaUrl || '',
        });

        match.lastMessage = text || 'Sent a photo 📷';
        match.lastMessageSender = socket.user._id;
        match.lastMessageAt = new Date();
        await match.save();

        const formattedMsg = {
          id: newMsg._id.toString(),
          matchId,
          senderId: socket.user._id.toString(),
          senderName: socket.user.name,
          text: newMsg.text,
          mediaUrl: newMsg.mediaUrl,
          createdAt: newMsg.createdAt,
        };

        io.to(`match_${matchId}`).emit('receive_message', formattedMsg);
      } catch (err) {
        console.error('[Socket Send Error]:', err.message);
        socket.emit('error_message', { message: 'Failed to deliver message' });
      }
    });

    socket.on('typing_status', ({ matchId, isTyping }) => {
      socket.to(`match_${matchId}`).emit('user_typing', {
        userId: socket.user._id.toString(),
        isTyping,
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 [Socket Disconnected] User: ${socket.user.name}`);
    });
  });
};
