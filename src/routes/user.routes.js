import express from 'express';
import {
  updateUserProfile,
  upgradePlan,
  changePassword,
  uploadGalleryPhotos,
  deleteGalleryPhoto,
  updateUserLocation,
  blockUser,
  reportUser,
  deleteAccount,
} from '../controllers/user.controller.js';
import {
  blockProfile,
  unblockProfile,
  getBlockedProfiles,
  reportProfile,
} from '../controllers/safety.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { uploadPhotos } from '../middleware/upload.middleware.js';

const router = express.Router();

router.use(protect);

router.put('/profile', uploadPhotos.array('photos', 6), updateUserProfile);
router.post('/upgrade-plan', upgradePlan);
router.put('/change-password', changePassword);
router.post('/photos', uploadPhotos.array('photos', 6), uploadGalleryPhotos);
router.delete('/photos', deleteGalleryPhoto);
router.put('/location', updateUserLocation);

// Safety & Blocking routes
router.get('/blocked', getBlockedProfiles);
router.post('/block', blockUser);
router.post('/:id/block', blockProfile);
router.delete('/:id/block', unblockProfile);
router.post('/report', reportUser);
router.post('/:id/report', reportProfile);

router.delete('/account', deleteAccount);

export default router;
