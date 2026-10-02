import User from '../models/user.model.js';
import { generateToken } from '../utils/generateToken.js';
import { validateCityLocation } from '../config/allowedCities.js';
import { toRelativePhotoPath } from '../utils/cloudinary.js';

/**
 * @desc    Check if a city / GPS location is eligible for registration (Gandhinagar restriction)
 * @route   POST /api/auth/check-location
 * @access  Public
 */
export const checkLocationEligibility = async (req, res) => {
  const { city, latitude, longitude } = req.body;
  const validation = validateCityLocation(city, latitude, longitude);

  res.status(200).json({
    success: validation.isAllowed,
    message: validation.reason,
    data: {
      isAllowed: validation.isAllowed,
      distanceKm: validation.distanceKm || 0,
      targetCity: 'Gandhinagar',
    },
  });
};

/**
 * @desc    Register a new user (Restricted to Gandhinagar city / allowed area)
 * @route   POST /api/auth/register
 * @access  Public (Supports both JSON and Multipart with optional photos array)
 */
export const registerUser = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      dateOfBirth,
      gender,
      genderPreference,
      city,
      latitude,
      longitude,
      bio,
      interests,
      datingIntent,
    } = req.body;

    if (!name || !email || !password || !dateOfBirth || !gender) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, password, dateOfBirth, gender.',
      });
    }

    // 1. Verify City / GPS Location Restriction (Gandhinagar)
    const userCity = city || 'Gandhinagar';
    const validation = validateCityLocation(userCity, latitude, longitude);

    if (!validation.isAllowed) {
      return res.status(403).json({
        success: false,
        message: validation.reason,
        restriction: 'Gandhinagar City Only',
      });
    }

    // 2. Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // 3. Format GeoJSON point coordinates if provided
    const coordinates =
      latitude && longitude
        ? [parseFloat(longitude), parseFloat(latitude)]
        : [72.6369, 23.2156]; // Default Gandhinagar [lng, lat]

    // 4. Handle photos if uploaded directly during registration
    let initialPhotos = [];
    if (req.files && req.files.length > 0) {
      initialPhotos = req.files.map((file) => {
        if (file.path && file.path.startsWith('http')) {
          return toRelativePhotoPath(file.path);
        }
        return `/uploads/${file.filename}`;
      });
    } else if (req.body.photos) {
      const rawPhotos = Array.isArray(req.body.photos) ? req.body.photos : [req.body.photos];
      initialPhotos = rawPhotos.map((p) => toRelativePhotoPath(p));
    }

    // 5. Parse interests if passed as JSON string in multipart form
    let parsedInterests = [];
    if (interests) {
      if (Array.isArray(interests)) parsedInterests = interests;
      else if (typeof interests === 'string') {
        try {
          parsedInterests = JSON.parse(interests);
        } catch {
          parsedInterests = interests.split(',').map((i) => i.trim());
        }
      }
    }

    // 6. Create user
    const user = await User.create({
      name,
      email,
      password,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      genderPreference: genderPreference || 'everyone',
      city: userCity,
      location: {
        type: 'Point',
        coordinates,
      },
      isCityVerified: true,
      bio: bio || '',
      photos: initialPhotos.slice(0, 6),
      interests: parsedInterests,
      datingIntent: datingIntent || 'Coffee date',
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Welcome to Gandhinagar Dating! Profile created successfully.',
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    user.lastActive = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current authenticated user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
};
