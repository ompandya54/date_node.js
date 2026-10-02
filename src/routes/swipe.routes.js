import express from 'express';
import {
  getDiscoveryFeed,
  getSingleUserProfile,
  swipeUser,
  getPendingRequests,
  respondToMatchRequest,
  undoLastSwipe,
  unmatchUser,
  getMatches,
} from '../controllers/swipe.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/feed', getDiscoveryFeed);
router.get('/user/:id', getSingleUserProfile);
router.post('/', swipeUser);
router.get('/requests', getPendingRequests);
router.post('/respond', respondToMatchRequest);
router.post('/undo', undoLastSwipe);
router.delete('/unmatch/:matchId', unmatchUser);
router.get('/matches', getMatches);

export default router;
