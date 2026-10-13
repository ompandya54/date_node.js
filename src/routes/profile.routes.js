import express from 'express';
import { getMyProfile, updateMyProfile } from '../controllers/profile.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);
router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);

export default router;
