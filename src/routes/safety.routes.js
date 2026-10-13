import express from 'express';
import {
  blockProfile,
  unblockProfile,
  getBlockedProfiles,
  reportProfile,
} from '../controllers/safety.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { safetyRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/blocks', safetyRateLimiter, blockProfile);
router.delete('/blocks/:profileId', unblockProfile);
router.get('/blocks', getBlockedProfiles);
router.post('/reports', safetyRateLimiter, reportProfile);

export default router;
