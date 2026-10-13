import express from 'express';
import {
  getDiscoverProfiles,
  getDiscoverProfileById,
  likeProfile,
  passProfile,
} from '../controllers/discover.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { swipeActionRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/profiles', getDiscoverProfiles);
router.get('/profiles/:id', getDiscoverProfileById);
router.post('/likes', swipeActionRateLimiter, likeProfile);
router.post('/passes', swipeActionRateLimiter, passProfile);

export default router;
