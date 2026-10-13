import express from 'express';
import { getPrivacySettings, updatePrivacySettings } from '../controllers/settings.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);
router.get('/privacy', getPrivacySettings);
router.put('/privacy', updatePrivacySettings);

export default router;
