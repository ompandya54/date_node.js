import express from 'express';
import { uploadPhoto } from '../controllers/photo.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { photoUploadRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post('/', protect, photoUploadRateLimiter, uploadPhoto);

export default router;
