import express from 'express';
import {
  searchNearbyPlaces,
  getPopularPlaces,
  startPlaceSession,
  getCurrentPlaceSession,
  stopPlaceSession,
  getPlacePeople,
} from '../controllers/place.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.post('/nearby-search', searchNearbyPlaces);
router.post('/nearby', searchNearbyPlaces);
router.get('/popular', getPopularPlaces);
router.post('/sessions', startPlaceSession);
router.post('/session/start', startPlaceSession);
router.post('/sessions/start', startPlaceSession);
router.post('/session/stop', stopPlaceSession);
router.post('/sessions/stop', stopPlaceSession);
router.get('/sessions/current', getCurrentPlaceSession);
router.get('/session/status', getCurrentPlaceSession);
router.get('/sessions/status', getCurrentPlaceSession);
router.delete('/sessions/current', stopPlaceSession);
router.delete('/session', stopPlaceSession);
router.get('/people', getPlacePeople);

export default router;
