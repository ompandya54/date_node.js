import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

/**
 * Middleware to protect routes via JWT Bearer Access Token
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Not authorized, missing authorization token',
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'User belonging to this token no longer exists.',
        });
      }

      const now = new Date();
      if (!req.user.lastActive || now - new Date(req.user.lastActive) > 5 * 60 * 1000) {
        User.findByIdAndUpdate(req.user._id, { lastActive: now }).catch(() => {});
      }

      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired',
        });
      }

      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Not authorized, token validation failed',
      });
    }
  }

  return res.status(401).json({
    success: false,
    code: 'UNAUTHORIZED',
    message: 'Not authorized, missing authorization header with Bearer token',
  });
};
