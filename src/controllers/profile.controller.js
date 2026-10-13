import User from '../models/user.model.js';
import PendingPhoto from '../models/photo.model.js';
import {
  GENDER_ENUM,
  DATING_INTENT_ENUM,
  HABIT_ENUM,
  formatMyProfile,
} from '../utils/shared.utils.js';
import { INTERESTS_CATALOG } from './meta.controller.js';
import { deleteFromCloudinary } from '../utils/cloudinary.js';

/**
 * @desc    Complete User Onboarding
 * @route   POST /api/onboarding/complete
 * @access  Private
 */
export const completeOnboarding = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.onboardingCompleted) {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_ONBOARDED',
        message: 'Onboarding has already been completed for this account.',
      });
    }

    const {
      name,
      dateOfBirth,
      gender,
      interestedIn,
      photoIds,
      bio,
      interestIds,
      datingIntent,
      drinking,
      smoking,
    } = req.body;

    const errors = {};

    // 1. Name validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.name = 'Name is required.';
    } else if (name.trim().length > 50) {
      errors.name = 'Name cannot exceed 50 characters.';
    }

    // 2. Date of Birth & 18+ Age Gate validation
    if (!dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required.';
    } else {
      const dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime()) || dob > new Date()) {
        errors.dateOfBirth = 'Please provide a valid past date of birth.';
      } else {
        const diffMs = Date.now() - dob.getTime();
        const age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
        if (age < 18) {
          errors.dateOfBirth = 'You must be at least 18 years old to join Gandhinagar Dating.';
        }
      }
    }

    // 3. Gender & InterestedIn validation
    if (!gender || !GENDER_ENUM.includes(gender)) {
      errors.gender = `Gender must be one of: ${GENDER_ENUM.join(', ')}.`;
    }

    if (!interestedIn || !Array.isArray(interestedIn) || interestedIn.length === 0) {
      errors.interestedIn = 'Please specify at least one gender preference in interestedIn.';
    } else {
      const invalidGenders = interestedIn.filter((g) => !GENDER_ENUM.includes(g));
      if (invalidGenders.length > 0) {
        errors.interestedIn = `Invalid gender preference: ${invalidGenders.join(', ')}.`;
      }
    }

    // 4. Photo IDs validation (2 to 6, all owned by user)
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length < 2 || photoIds.length > 6) {
      errors.photoIds = 'You must provide between 2 and 6 photos.';
    }

    // 5. Bio validation (max 500)
    if (bio !== undefined && bio !== null && typeof bio === 'string' && bio.length > 500) {
      errors.bio = 'Bio cannot exceed 500 characters.';
    }

    // 6. Interest IDs validation (3 to 10 unique, all in catalog)
    const validCatalogIds = INTERESTS_CATALOG.map((i) => i.id);
    if (!interestIds || !Array.isArray(interestIds) || interestIds.length < 3 || interestIds.length > 10) {
      errors.interestIds = 'Please select between 3 and 10 interests.';
    } else {
      const uniqueInterests = [...new Set(interestIds)];
      if (uniqueInterests.length !== interestIds.length) {
        errors.interestIds = 'Interests must be unique.';
      }
      const invalidInterests = interestIds.filter((id) => !validCatalogIds.includes(id));
      if (invalidInterests.length > 0) {
        errors.interestIds = `Invalid interest ID: ${invalidInterests.join(', ')}.`;
      }
    }

    // 7. Dating intent & Habits validation
    if (datingIntent && !DATING_INTENT_ENUM.includes(datingIntent)) {
      errors.datingIntent = `Dating intent must be one of: ${DATING_INTENT_ENUM.join(', ')}.`;
    }

    if (drinking && !HABIT_ENUM.includes(drinking)) {
      errors.drinking = `Drinking habit must be one of: ${HABIT_ENUM.join(', ')}.`;
    }

    if (smoking && !HABIT_ENUM.includes(smoking)) {
      errors.smoking = `Smoking habit must be one of: ${HABIT_ENUM.join(', ')}.`;
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors,
      });
    }

    // Fetch and verify pending photos
    const userPendingPhotos = await PendingPhoto.find({
      userId: user._id,
      photoId: { $in: photoIds },
    });

    if (userPendingPhotos.length < photoIds.length) {
      return res.status(422).json({
        success: false,
        code: 'INVALID_PHOTO_IDS',
        message: 'One or more photo IDs are invalid or not owned by your account.',
        errors: { photoIds: 'One or more photos could not be verified.' },
      });
    }

    // Map ordered photos (first photo is main)
    const orderedPhotos = photoIds.map((id) => {
      const found = userPendingPhotos.find((p) => p.photoId === id);
      return { id, url: found ? found.url : '' };
    });

    // Mark pending photos as attached
    await PendingPhoto.updateMany(
      { userId: user._id, photoId: { $in: photoIds } },
      { $set: { isAttached: true } }
    );

    // Calculate age from dateOfBirth
    const dobDate = new Date(dateOfBirth);
    const diffMs = Date.now() - dobDate.getTime();
    const computedAge = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);

    // Update user profile
    user.name = name.trim();
    user.dateOfBirth = dobDate;
    user.age = computedAge;
    user.gender = gender;
    user.interestedIn = interestedIn;
    user.photos = orderedPhotos;
    user.bio = bio ? bio.trim() : null;
    user.interestIds = interestIds;
    user.datingIntent = datingIntent || 'longTermRelationship';
    user.drinking = drinking || null;
    user.smoking = smoking || null;
    user.onboardingCompleted = true;

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        profile: formatMyProfile(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get Current User's Own Profile
 * @route   GET /api/profile/me
 * @access  Private
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.onboardingCompleted) {
      return res.status(404).json({
        success: false,
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found. Please complete onboarding first.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        profile: formatMyProfile(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Own Profile
 * @route   PATCH /api/profile/me
 * @access  Private
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.onboardingCompleted) {
      return res.status(404).json({
        success: false,
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found. Please complete onboarding first.',
      });
    }

    // Immutable field check: gender and dateOfBirth cannot be changed after onboarding
    if (req.body.gender !== undefined || req.body.dateOfBirth !== undefined) {
      return res.status(422).json({
        success: false,
        code: 'FIELD_NOT_EDITABLE',
        message: 'gender and dateOfBirth are not editable after onboarding.',
      });
    }

    const {
      name,
      bio,
      interestIds,
      interestedIn,
      datingIntent,
      drinking,
      smoking,
      photoIds,
    } = req.body;

    const errors = {};

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        errors.name = 'Name cannot be empty.';
      } else if (name.trim().length > 50) {
        errors.name = 'Name cannot exceed 50 characters.';
      } else {
        user.name = name.trim();
      }
    }

    if (bio !== undefined) {
      if (bio !== null && typeof bio === 'string' && bio.length > 500) {
        errors.bio = 'Bio cannot exceed 500 characters.';
      } else {
        user.bio = bio ? bio.trim() : null;
      }
    }

    if (interestedIn !== undefined) {
      if (!Array.isArray(interestedIn) || interestedIn.length === 0) {
        errors.interestedIn = 'Please specify at least one gender preference.';
      } else {
        const invalidGenders = interestedIn.filter((g) => !GENDER_ENUM.includes(g));
        if (invalidGenders.length > 0) {
          errors.interestedIn = `Invalid gender: ${invalidGenders.join(', ')}.`;
        } else {
          user.interestedIn = interestedIn;
        }
      }
    }

    if (interestIds !== undefined) {
      const validCatalogIds = INTERESTS_CATALOG.map((i) => i.id);
      if (!Array.isArray(interestIds) || interestIds.length < 3 || interestIds.length > 10) {
        errors.interestIds = 'Please select between 3 and 10 interests.';
      } else {
        const invalid = interestIds.filter((id) => !validCatalogIds.includes(id));
        if (invalid.length > 0) {
          errors.interestIds = `Invalid interest: ${invalid.join(', ')}.`;
        } else {
          user.interestIds = interestIds;
        }
      }
    }

    if (datingIntent !== undefined) {
      if (!DATING_INTENT_ENUM.includes(datingIntent)) {
        errors.datingIntent = 'Invalid dating intent.';
      } else {
        user.datingIntent = datingIntent;
      }
    }

    if (drinking !== undefined) {
      if (drinking !== null && !HABIT_ENUM.includes(drinking)) {
        errors.drinking = 'Invalid drinking habit.';
      } else {
        user.drinking = drinking;
      }
    }

    if (smoking !== undefined) {
      if (smoking !== null && !HABIT_ENUM.includes(smoking)) {
        errors.smoking = 'Invalid smoking habit.';
      } else {
        user.smoking = smoking;
      }
    }

    if (photoIds !== undefined) {
      if (!Array.isArray(photoIds) || photoIds.length < 2 || photoIds.length > 6) {
        errors.photoIds = 'You must have between 2 and 6 photos.';
      } else {
        // Collect existing and pending photos
        const existingPhotos = user.photos || [];
        const pendingPhotos = await PendingPhoto.find({
          userId: user._id,
          photoId: { $in: photoIds },
        });

        const newPhotoList = [];
        for (const pId of photoIds) {
          const foundExisting = existingPhotos.find((p) => p.id === pId);
          if (foundExisting) {
            newPhotoList.push(foundExisting);
          } else {
            const foundPending = pendingPhotos.find((p) => p.photoId === pId);
            if (foundPending) {
              newPhotoList.push({ id: pId, url: foundPending.url });
              foundPending.isAttached = true;
              await foundPending.save();
            } else {
              errors.photoIds = `Photo ID ${pId} not found or not owned by you.`;
              break;
            }
          }
        }

        if (!errors.photoIds) {
          // Delete removed photos
          const currentIds = newPhotoList.map((p) => p.id);
          const removedPhotos = existingPhotos.filter((p) => !currentIds.includes(p.id));
          for (const rem of removedPhotos) {
            try {
              await deleteFromCloudinary(rem.url);
              await PendingPhoto.deleteOne({ photoId: rem.id });
            } catch {}
          }
          user.photos = newPhotoList;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors,
      });
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        profile: formatMyProfile(user),
      },
    });
  } catch (error) {
    next(error);
  }
};
