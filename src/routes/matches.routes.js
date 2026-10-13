import express from 'express';
import { getMatches, markMatchSeen, unmatchUser } from '../controllers/matches.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);
router.get('/', getMatches);
router.post('/:matchId/seen', markMatchSeen);
router.delete('/:matchId', unmatchUser);

export default router;
