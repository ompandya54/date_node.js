import express from 'express';
import { getLikesYou } from '../controllers/discover.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);
router.get('/', getLikesYou);

export default router;
