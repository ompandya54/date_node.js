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
router.get('/popular', getPopularPlaces);
router.post('/sessions', startPlaceSession);
router.get('/sessions/current', getCurrentPlaceSession);
router.delete('/sessions/current', stopPlaceSession);
router.get('/people', getPlacePeople);

export default router;
