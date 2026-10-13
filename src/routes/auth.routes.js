import express from 'express';
import {
  registerUser,
  loginUser,
  googleAuth,
  sendOTP,
  verifyOTP,
  refreshToken,
  logoutUser,
  getMe,
  forgotPassword,
  resetPassword,
  checkLocationEligibility,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authRateLimiter, refreshRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post('/check-location', checkLocationEligibility);

router.post('/send-otp', authRateLimiter, sendOTP);
router.post('/verify-otp', authRateLimiter, verifyOTP);

router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.post('/google', authRateLimiter, googleAuth);

router.post('/refresh', refreshRateLimiter, refreshToken);
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getMe);

router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);

export default router;
