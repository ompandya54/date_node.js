import crypto from 'crypto';
import { NearbySession, NearbyConsent } from '../models/nearby.model.js';
import User from '../models/user.model.js';
import { encodeGeohash, getGeohashAdjacentCells, canSee } from '../utils/shared.utils.js';
import { recordEncounters } from '../utils/encounter.utils.js';

// In-memory 15s refresh cache: userId -> { timestamp, responseData }
const nearbyCache = new Map();

// In-memory session start timestamps: userId -> Array of timestamps for 6 starts/hour rate limit
const sessionStartHistory = new Map();

const isSessionStartRateLimited = (userId, maxPerHour = 6) => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  let timestamps = sessionStartHistory.get(userId) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= maxPerHour) {
    return true;
  }
  timestamps.push(now);
  sessionStartHistory.set(userId, timestamps);
  return false;
};

/**
 * Deterministic pseudo-random comparator seeded by session id
 */
const deterministicSort = (sessionId) => {
  return (a, b) => {
    const hashA = crypto.createHash('md5').update(`${sessionId}_${a.profileId}`).digest('hex');
    const hashB = crypto.createHash('md5').update(`${sessionId}_${b.profileId}`).digest('hex');
    return hashA.localeCompare(hashB);
  };
};

/**
 * @desc    Start Nearby session
 * @route   POST /api/nearby/sessions
 * @access  Private
 */
export const startNearbySession = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const { durationMinutes, latitude, longitude, consentAcknowledged } = req.body;

    const user = await User.findById(viewerId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found.',
      });
    }

    // 1. Refuse if locationDiscovery is disabled or profile is hidden
    const locationAllowed = !user.hideProfile && (user.locationDiscoveryEnabled ?? true);
    if (!locationAllowed) {
      return res.status(403).json({
        success: false,
        code: 'LOCATION_DISCOVERY_DISABLED',
        message: 'Location discovery is disabled in your privacy settings.',
      });
    }

    // 2. Consent check
    const existingConsent = await NearbyConsent.findOne({ userId: viewerId });
    if (!existingConsent) {
      if (consentAcknowledged !== true) {
        return res.status(422).json({
          success: false,
          code: 'CONSENT_REQUIRED',
          message: 'Nearby session requires explicit user consent.',
        });
      }
      await NearbyConsent.create({
        userId: viewerId,
        type: 'nearby',
        acknowledgedAt: new Date(),
      });
    }

    // 3. Validation
    if (![30, 60, 120].includes(Number(durationMinutes))) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'durationMinutes must be 30, 60, or 120.',
        errors: { durationMinutes: 'durationMinutes must be 30, 60, or 120' },
      });
    }

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Valid latitude and longitude numbers are required in request body.',
        errors: { coordinates: 'Invalid coordinates' },
      });
    }

    // 4. Rate limit session starts: 6 per hour per user
    if (isSessionStartRateLimited(viewerId.toString(), 6)) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_REQUESTS',
        message: 'Nearby session start rate limit exceeded. Try again later.',
      });
    }

    // 5. In-Memory coarse cell conversion (discards raw coordinates immediately)
    const coarseCell = encodeGeohash(latitude, longitude, 6);

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

    // One active session per user: replace old one
    await NearbySession.deleteMany({ userId: viewerId });

    const session = await NearbySession.create({
      userId: viewerId,
      cell: coarseCell,
      durationMinutes: Number(durationMinutes),
      startedAt,
      expiresAt,
    });

    // Invalidate cached people
    nearbyCache.delete(viewerId.toString());

    // 6. Call B8 Crossed Paths encounter hook
    await recordEncounters(viewerId, session);

    res.status(201).json({
      success: true,
      data: {
        session: {
          id: session._id.toString(),
          startedAt: session.startedAt,
          expiresAt: session.expiresAt,
          durationMinutes: session.durationMinutes,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current active Nearby session
 * @route   GET /api/nearby/sessions/current
 * @access  Private
 */
export const getCurrentNearbySession = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const session = await NearbySession.findOne({
      userId: viewerId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(200).json({
        success: true,
        data: {
          session: null,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        session: {
          id: session._id.toString(),
          startedAt: session.startedAt,
          expiresAt: session.expiresAt,
          durationMinutes: session.durationMinutes,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    End current Nearby session immediately
 * @route   DELETE /api/nearby/sessions/current
 * @access  Private
 */
export const stopNearbySession = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    await NearbySession.deleteMany({ userId: viewerId });
    nearbyCache.delete(viewerId.toString());

    res.status(200).json({
      success: true,
      message: 'Nearby session ended.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get nearby people with anti-trilateration and 15s refresh cache
 * @route   GET /api/nearby/people
 * @access  Private
 */
export const getNearbyPeople = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const session = await NearbySession.findOne({
      userId: viewerId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACTIVE_SESSION',
        message: 'No active nearby session found.',
      });
    }

    // 15-second refresh limit: return cached result if requested within 15s
    const cacheKey = viewerId.toString();
    const cached = nearbyCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < 15000) {
      return res.status(200).json({
        success: true,
        data: cached.data,
      });
    }

    const user = await User.findById(viewerId);
    const searchCells = getGeohashAdjacentCells(session.cell);

    const activeSessions = await NearbySession.find({
      userId: { $ne: viewerId },
      cell: { $in: searchCells },
      expiresAt: { $gt: new Date() },
    }).lean();

    const excludedIds = [
      ...(user.matches || []).map((id) => id.toString()),
      ...(user.actedOn || []).map((id) => id.toString()),
      ...(user.blockedUsers || []).map((id) => id.toString()),
    ];

    const candidateIds = activeSessions
      .map((s) => s.userId.toString())
      .filter((id) => !excludedIds.includes(id));

    const uniqueCandidateIds = [...new Set(candidateIds)];

    const candidateUsers = await User.find({
      _id: { $in: uniqueCandidateIds },
      isActive: true,
      onboardingCompleted: true,
    });

    const eligibleItems = [];

    for (const cand of candidateUsers) {
      if (!canSee(user, cand, true)) continue;

      const photoUrl = cand.photos && cand.photos.length > 0
        ? (typeof cand.photos[0] === 'object' ? cand.photos[0].url : cand.photos[0])
        : '';

      eligibleItems.push({
        profileId: cand._id.toString(),
        name: cand.name || '',
        age: cand.age || 0,
        photoUrl,
        datingIntent: cand.datingIntent || 'longTermRelationship',
      });
    }

    // Anti-trilateration rule: if fewer than 3 eligible people exist, return notEnoughPeople with empty items
    let responseData;
    if (eligibleItems.length < 3) {
      responseData = {
        status: 'notEnoughPeople',
        items: [],
      };
    } else {
      // Deterministic shuffle seeded by session ID, capped at 20
      eligibleItems.sort(deterministicSort(session._id.toString()));
      responseData = {
        status: 'people',
        items: eligibleItems.slice(0, 20),
      };
    }

    // Save to 15s cache
    nearbyCache.set(cacheKey, {
      timestamp: now,
      data: responseData,
    });

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
};
