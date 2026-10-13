import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Generate Access Token (JWT - 1 hour)
 */
export const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret_key', {
    expiresIn: '1h',
  });
};

/**
 * Generate Random Refresh Token
 */
export const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Hash a string (e.g. Refresh Token or Reset Token) using SHA-256
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
