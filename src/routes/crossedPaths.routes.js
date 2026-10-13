import express from 'express';
import {
  getCrossedPaths,
  markCrossedPathsSeen,
  expressCrossedPathInterest,
  dismissCrossedPath,
  getCrossedPathsSettings,
  updateCrossedPathsSettings,
  clearCrossedPaths,
} from '../controllers/crossedPaths.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getCrossedPaths);
router.delete('/', clearCrossedPaths);
router.post('/seen', markCrossedPathsSeen);
router.get('/settings', getCrossedPathsSettings);
router.put('/settings', updateCrossedPathsSettings);
router.post('/:id/interest', expressCrossedPathInterest);
router.post('/:id/dismiss', dismissCrossedPath);

export default router;
