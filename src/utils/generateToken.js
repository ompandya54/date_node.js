import { generateAccessToken } from './token.utils.js';

export const generateToken = (userId) => {
  return generateAccessToken(userId);
};
