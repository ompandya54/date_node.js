import jwt from 'jsonwebtoken';

/**
 * Generate JWT token for a given user ID
 * @param {string} userId - User ID from database
 * @returns {string} JWT Token
 */
export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret_key', {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};
