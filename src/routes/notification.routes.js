import express from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  registerDevice,
  unregisterDevice,
} from '../controllers/notification.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

// 1. Device push token routes (MUST be registered before /:id parameter routes!)
router.post('/device-token', registerDevice);
router.delete('/device-token', unregisterDevice);
router.delete('/device-token/:token', unregisterDevice);

// 2. Static notification routes
router.get('/', getNotifications);
router.post('/read-all', markAllNotificationsRead);
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);
router.delete('/', clearAllNotifications);

// 3. Dynamic /:id routes (registered AFTER static endpoints)
router.post('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

export default router;
