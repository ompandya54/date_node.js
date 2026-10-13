import express from 'express';
import {
  getConversations,
  getMessages,
  sendMessageREST,
  markChatRead,
  getMatchIcebreaker,
  answerMatchIcebreaker,
  getChatHistory,
  sendMessageHTTP,
  markMessagesAsRead,
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { chatRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.use(protect);

// B4 Chat REST Endpoints
router.get('/conversations', getConversations);
router.get('/:matchId/messages', getMessages);
router.post('/:matchId/messages', chatRateLimiter, sendMessageREST);
router.post('/:matchId/read', markChatRead);
router.get('/:matchId/icebreaker', getMatchIcebreaker);
router.post('/:matchId/icebreaker', answerMatchIcebreaker);

// Legacy routes preserved until B9
router.get('/:matchId', getChatHistory);
router.put('/read/:matchId', markMessagesAsRead);
router.post('/send', chatRateLimiter, sendMessageHTTP);

export default router;
