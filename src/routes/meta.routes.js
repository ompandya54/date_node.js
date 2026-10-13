import express from 'express';
import { getInterestsCatalog, getAppConfig } from '../controllers/meta.controller.js';

const router = express.Router();

router.get('/interests', getInterestsCatalog);
router.get('/config', getAppConfig);

export default router;
