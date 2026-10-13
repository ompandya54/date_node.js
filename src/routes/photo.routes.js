import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { uploadPhoto } from '../controllers/photo.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Memory storage for Sharp buffer processing
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// Rate limiter: 20 photo uploads per hour per user
const photoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Photo upload limit reached (20/hour). Please try again later.',
    });
  },
});

router.use(protect);
router.post('/', photoUploadLimiter, upload.single('file'), uploadPhoto);

export default router;
