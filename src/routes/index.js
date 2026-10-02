import express from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import swipeRoutes from './swipe.routes.js';
import chatRoutes from './chat.routes.js';

const router = express.Router();

// Health check route for Flutter app connection test
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gandhinagar Dating Backend API is online!',
    targetCity: 'Gandhinagar',
    timestamp: new Date().toISOString(),
  });
});

// Mount modular sub-routers
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/swipe', swipeRoutes);
router.use('/chat', chatRoutes);

export default router;
