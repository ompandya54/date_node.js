import express from 'express';
import {
  getChatHistory,
  sendMessageHTTP,
  markMessagesAsRead,
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/:matchId', getChatHistory);
router.put('/read/:matchId', markMessagesAsRead);
router.post('/send', sendMessageHTTP);

export default router;
