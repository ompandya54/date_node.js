import express from 'express';
import {
  registerUser,
  loginUser,
  getMe,
  checkLocationEligibility,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { uploadPhotos } from '../middleware/upload.middleware.js';

const router = express.Router();

router.post('/check-location', checkLocationEligibility);

// Register supports optional profile photo uploads directly (up to 6 photos)
router.post('/register', uploadPhotos.array('photos', 6), registerUser);

router.post('/login', loginUser);
router.get('/me', protect, getMe);

export default router;
