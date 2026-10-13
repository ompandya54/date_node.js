import express from 'express';
import { completeOnboarding } from '../controllers/profile.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);
router.post('/complete', completeOnboarding);

export default router;
