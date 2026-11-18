import express from 'express';
import {
  getFeed,
  likeFeedProfile,
  passFeedProfile,
} from '../controllers/feed.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { swipeActionRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getFeed);

// Support both /api/feed/:id/like and /api/feed/like (with body)
router.post('/:id/like', swipeActionRateLimiter, likeFeedProfile);
router.post('/like', swipeActionRateLimiter, likeFeedProfile);

// Support both /api/feed/:id/pass and /api/feed/pass (with body)
router.post('/:id/pass', swipeActionRateLimiter, passFeedProfile);
router.post('/pass', swipeActionRateLimiter, passFeedProfile);

export default router;

