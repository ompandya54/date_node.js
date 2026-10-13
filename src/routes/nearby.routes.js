import express from 'express';
import {
  startNearbySession,
  getCurrentNearbySession,
  stopNearbySession,
  getNearbyPeople,
} from '../controllers/nearby.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.post('/sessions', startNearbySession);
router.get('/sessions/current', getCurrentNearbySession);
router.delete('/sessions/current', stopNearbySession);
router.get('/people', getNearbyPeople);

export default router;
