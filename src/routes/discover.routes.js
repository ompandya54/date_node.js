import express from 'express';
import {
  getDiscoverProfiles,
  getDiscoverProfileById,
  likeProfile,
  passProfile,
} from '../controllers/discover.controller.js';
import {
  getFeed,
  likeFeedProfile,
  passFeedProfile,
} from '../controllers/feed.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { swipeActionRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/profiles', getDiscoverProfiles);
router.get('/profiles/:id', getDiscoverProfileById);
router.get('/feed', getFeed);

router.post('/likes', swipeActionRateLimiter, likeProfile);
router.post('/passes', swipeActionRateLimiter, passProfile);
router.post('/:id/like', swipeActionRateLimiter, likeFeedProfile);
router.post('/:id/pass', swipeActionRateLimiter, passFeedProfile);

export default router;
