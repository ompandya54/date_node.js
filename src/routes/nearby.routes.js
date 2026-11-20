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
router.post('/session/start', startNearbySession);
router.post('/sessions/start', startNearbySession);
router.post('/session/stop', stopNearbySession);
router.post('/sessions/stop', stopNearbySession);
router.get('/sessions/current', getCurrentNearbySession);
router.get('/session/status', getCurrentNearbySession);
router.get('/sessions/status', getCurrentNearbySession);
router.delete('/sessions/current', stopNearbySession);
router.delete('/session', stopNearbySession);
router.get('/people', getNearbyPeople);

export default router;
