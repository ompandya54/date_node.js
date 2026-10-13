import express from 'express';
import {
  registerDevice,
  unregisterDevice,
} from '../controllers/notification.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.post('/', registerDevice);
router.delete('/:token', unregisterDevice);

export default router;
