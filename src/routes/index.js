import express from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import photosRoutes from './photos.routes.js';
import onboardingRoutes from './onboarding.routes.js';
import profileRoutes from './profile.routes.js';
import settingsRoutes from './settings.routes.js';
import discoverRoutes from './discover.routes.js';
import likesYouRoutes from './likesYou.routes.js';
import matchesRoutes from './matches.routes.js';
import safetyRoutes from './safety.routes.js';
import chatRoutes from './chat.routes.js';
import notificationRoutes from './notification.routes.js';
import deviceRoutes from './device.routes.js';
import nearbyRoutes from './nearby.routes.js';
import placeRoutes from './place.routes.js';
import crossedPathsRoutes from './crossedPaths.routes.js';
import metaRoutes from './meta.routes.js';
import userRoutes from './user.routes.js';
import swipeRoutes from './swipe.routes.js';

const router = express.Router();

/**
 * Health check route (fast & public, responds in < 1 second)
 */
router.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    success: true,
    message: 'Gandhinagar Dating Backend API is online!',
    targetCity: 'Gandhinagar',
    dbStatus: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Deep health readiness route for load balancers (B9)
 */
router.get('/health/ready', async (req, res) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (!isDbConnected) {
      return res.status(503).json({
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection not ready.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        status: 'ready',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: err.message,
    });
  }
});

// Mount B1-B8 core sub-routers
router.use('/auth', authRoutes);
router.use('/photos', photosRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/profile', profileRoutes);
router.use('/settings', settingsRoutes);
router.use('/discover', discoverRoutes);
router.use('/likes-you', likesYouRoutes);
router.use('/matches', matchesRoutes);
router.use('/safety', safetyRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/devices', deviceRoutes);
router.use('/nearby', nearbyRoutes);
router.use('/places', placeRoutes);
router.use('/crossed-paths', crossedPathsRoutes);
router.use('/meta', metaRoutes);

// Legacy routes preserved until B9
router.use('/users', userRoutes);
router.use('/swipe', swipeRoutes);

export default router;
