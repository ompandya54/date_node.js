import User from '../models/user.model.js';
import Device from '../models/device.model.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/token.utils.js';
import { sendOTPEmail } from '../utils/email.utils.js';
import { formatMyProfile } from '../utils/shared.utils.js';

/**
 * Helper to build minimal response user object
 */
const formatAuthUser = (user) => {
  return {
    id: user._id.toString(),
    email: user.email,
    isEmailVerified: !!user.isEmailVerified,
    onboardingCompleted: !!user.onboardingCompleted,
  };
};

/**
 * Helper to generate 6-digit numeric OTP
 */
const generate6DigitOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @desc    Check location eligibility (Deprecated)
 * @route   POST /api/auth/check-location
 * @access  Public
 */
export const checkLocationEligibility = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Location verification is deprecated. Gandhinagar city remains default.',
    data: {
      isAllowed: true,
      distanceKm: 0,
      targetCity: 'Gandhinagar',
    },
  });
};

/**
 * @desc    Send 6-digit Email OTP for Registration or Password Reset
 * @route   POST /api/auth/send-otp
 * @access  Public
 */
export const sendOTP = async (req, res, next) => {
  try {
    const { email, purpose = 'register' } = req.body;

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: {
          email: 'Please provide a valid email address.',
        },
      });
    }

    const otp = generate6DigitOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let user = await User.findOne({ email: trimmedEmail }).select('+password');

    if (purpose === 'register' && user && user.password) {
      return res.status(422).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'Validation failed',
        errors: {
          email: 'This email is already registered.',
        },
      });
    }

    if (!user) {
      user = await User.create({
        email: trimmedEmail,
        otpCode: otp,
        otpExpires,
        authProvider: 'password',
        onboardingCompleted: false,
        isEmailVerified: false,
      });
    } else {
      user.otpCode = otp;
      user.otpExpires = otpExpires;
      await user.save();
    }

    await sendOTPEmail(trimmedEmail, otp, purpose);

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email address successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify 6-digit Email OTP
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Please provide email and 6-digit OTP code',
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      email: trimmedEmail,
      otpCode: otp.toString().trim(),
      otpExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'Invalid or expired OTP code.',
      });
    }

    user.isEmailVerified = true;
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email OTP verified successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Minimal Registration with Email & Password
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const errors = {};

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      errors.email = 'Please provide a valid email address.';
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors,
      });
    }

    let user = await User.findOne({ email: trimmedEmail }).select('+password');

    if (user && user.password) {
      return res.status(422).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'Validation failed',
        errors: {
          email: 'This email is already registered.',
        },
      });
    }

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (user) {
      user.password = password;
      user.authProvider = 'password';
      user.onboardingCompleted = false;
      user.refreshTokens.push({ tokenHash, expiresAt: refreshExpiresAt });
      await user.save();
    } else {
      user = await User.create({
        email: trimmedEmail,
        password,
        authProvider: 'password',
        onboardingCompleted: false,
        refreshTokens: [{ tokenHash, expiresAt: refreshExpiresAt }],
      });
    }

    const accessToken = generateAccessToken(user._id);

    res.status(201).json({
      success: true,
      data: {
        user: formatAuthUser(user),
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get tokens
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await User.findOne({ email: trimmedEmail }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    user.refreshTokens.push({ tokenHash, expiresAt: refreshExpiresAt });
    user.lastActive = new Date();
    await user.save();

    const accessToken = generateAccessToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        user: formatAuthUser(user),
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Google Sign-In / Sign-Up
 * @route   POST /api/auth/google
 * @access  Public
 */
export const googleAuth = async (req, res, next) => {
  try {
    const { idToken, email, googleId, name, photoUrl } = req.body;

    let targetEmail = email ? email.trim().toLowerCase() : null;
    let targetGoogleId = googleId || null;

    if (idToken) {
      try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (response.ok) {
          const payload = await response.json();
          if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) {
            console.warn('[Google Auth Warning] Client ID mismatch:', payload.aud);
          }
          if (payload.email) targetEmail = payload.email.toLowerCase();
          if (payload.sub) targetGoogleId = payload.sub;
        }
      } catch (err) {
        console.warn('[Google Auth] TokenInfo verification warning:', err.message);
      }
    }

    if (!targetEmail && !targetGoogleId) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: {
          email: 'Please provide a valid Google account email or idToken.',
        },
      });
    }

    const query = [];
    if (targetEmail) query.push({ email: targetEmail });
    if (targetGoogleId) query.push({ googleId: targetGoogleId });

    let user = await User.findOne({ $or: query });
    let statusCode = 200;

    if (!user) {
      user = await User.create({
        email: targetEmail,
        googleId: targetGoogleId,
        name: name || '',
        photos: photoUrl ? [photoUrl] : [],
        authProvider: 'google',
        isEmailVerified: true,
        onboardingCompleted: false,
        refreshTokens: [],
      });
      statusCode = 201;
    } else {
      if (targetGoogleId && !user.googleId) {
        user.googleId = targetGoogleId;
      }
      user.isEmailVerified = true;
    }

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    user.refreshTokens.push({ tokenHash, expiresAt: refreshExpiresAt });
    user.lastActive = new Date();
    await user.save();

    const accessToken = generateAccessToken(user._id);

    res.status(statusCode).json({
      success: true,
      data: {
        user: formatAuthUser(user),
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refresh Access Token using Rotating Refresh Token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: rawRefreshToken } = req.body;

    if (!rawRefreshToken) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Refresh token is required',
      });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash });

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid or revoked refresh token',
      });
    }

    const existingToken = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
    if (!existingToken || existingToken.expiresAt < new Date()) {
      user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
      await user.save();
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Expired refresh token',
      });
    }

    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);

    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    user.refreshTokens.push({ tokenHash: newTokenHash, expiresAt: refreshExpiresAt });
    await user.save();

    const newAccessToken = generateAccessToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
export const logoutUser = async (req, res, next) => {
  try {
    const { refreshToken: rawRefreshToken, deviceToken } = req.body;
    const user = await User.findById(req.user._id);

    if (user) {
      if (rawRefreshToken) {
        const tokenHash = hashToken(rawRefreshToken);
        user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
      }
      if (deviceToken) {
        user.deviceTokens = (user.deviceTokens || []).filter((d) => d !== deviceToken);
        await Device.deleteOne({ token: deviceToken });
      }
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current authenticated user session & profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res, next) => {
  try {
    const user = req.user;
    const isCompleted = !!user.onboardingCompleted;

    const profile = isCompleted ? formatMyProfile(user) : null;

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          isEmailVerified: !!user.isEmailVerified,
          onboardingCompleted: isCompleted,
          profile,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request password reset via Email OTP Code
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (email && typeof email === 'string') {
      const trimmedEmail = email.trim().toLowerCase();
      const user = await User.findOne({ email: trimmedEmail });

      if (user) {
        const otp = generate6DigitOTP();
        const resetToken = generateRefreshToken();

        user.otpCode = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        user.resetPasswordToken = hashToken(resetToken);
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        await sendOTPEmail(trimmedEmail, otp, 'forgot_password');
      }
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, an OTP link/code has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using valid 6-digit OTP code or reset Token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, token, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: {
          password: 'Password must be at least 8 characters long.',
        },
      });
    }

    let user = null;

    if (email && otp) {
      user = await User.findOne({
        email: email.trim().toLowerCase(),
        otpCode: otp.toString().trim(),
        otpExpires: { $gt: new Date() },
      });
    } else if (token) {
      const hashedToken = hashToken(token);
      user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() },
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Password reset OTP code or token is invalid or has expired.',
      });
    }

    user.password = newPassword;
    user.otpCode = null;
    user.otpExpires = null;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.refreshTokens = []; // Revoke all active sessions on password reset
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};
