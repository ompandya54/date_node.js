import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const getUserOrIpKey = (req, res) => {
  if (req.user && req.user._id) {
    return req.user._id.toString();
  }
  return ipKeyGenerator(req, res);
};

/**
 * 1. Auth Rate Limiter (login / register / forgot-password)
 * Limit: 10 requests per minute per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again after 60 seconds.',
    });
  },
});

/**
 * 2. Token Refresh Rate Limiter
 * Limit: 30 requests per minute per user/IP
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserOrIpKey,
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Token refresh limit exceeded. Please try again after 60 seconds.',
    });
  },
});

/**
 * 3. Photo Upload Rate Limiter
 * Limit: 20 per hour per user
 */
export const photoUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserOrIpKey,
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Photo upload rate limit exceeded (max 20 per hour).',
    });
  },
});

/**
 * 4. Chat Sending Rate Limiter
 * Limit: 30 messages per minute per user
 */
export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserOrIpKey,
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_MESSAGES',
      message: 'You are sending messages too quickly. Please slow down.',
    });
  },
});

/**
 * 5. Likes and Passes Rate Limiter
 * Limit: 200 per hour per user
 */
export const swipeActionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserOrIpKey,
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Swipe action rate limit reached (200/hour). Please try again later.',
    });
  },
});

/**
 * 6. Safety Block and Report Rate Limiter
 * Limit: 20 per hour per user
 */
export const safetyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserOrIpKey,
  handler: (req, res, next, options) => {
    res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
    res.status(429).json({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: 'Safety actions rate limit exceeded (20/hour).',
    });
  },
});
