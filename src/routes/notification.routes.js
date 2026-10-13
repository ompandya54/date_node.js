import express from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../controllers/notification.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getNotifications);
router.post('/read-all', markAllNotificationsRead);
router.post('/:id/read', markNotificationRead);
router.delete('/', clearAllNotifications);
router.delete('/:id', deleteNotification);

router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);

export default router;
