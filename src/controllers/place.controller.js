import crypto from 'crypto';
import { Place, PlaceConsent, PlaceSession } from '../models/place.model.js';
import User from '../models/user.model.js';
import { canSee } from '../utils/shared.utils.js';
import { recordEncounters } from '../utils/encounter.utils.js';

const CLAIM_SECRET = process.env.PLACE_CLAIM_SECRET || 'gandhinagar_place_claim_secret_key_2026';

// In-memory 15s refresh cache: userId -> { timestamp, data }
const placeCache = new Map();

// In-memory search rate limiter: userId -> Array of timestamps (20/hour/user)
const searchHistory = new Map();

// In-memory unverified starts per day: userId -> Array of timestamps
const unverifiedStartsToday = new Map();

const isSearchRateLimited = (userId, maxPerHour = 20) => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  let timestamps = searchHistory.get(userId) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= maxPerHour) {
    return true;
  }
  timestamps.push(now);
  searchHistory.set(userId, timestamps);
  return false;
};

const checkAndIncrementUnverifiedStarts = (userId) => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let timestamps = unverifiedStartsToday.get(userId) || [];
  timestamps = timestamps.filter((t) => now - t < dayMs);

  if (timestamps.length >= 3) {
    return false; // Exceeded limit (4th start rejected with 429)
  }
  timestamps.push(now);
  unverifiedStartsToday.set(userId, timestamps);
  return true;
};

/**
 * Haversine formula in meters
 */
const calculateHaversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Create HMAC claim token for a venue search
 */
const createVenueClaim = (userId, placeId) => {
  const payload = {
    userId: userId.toString(),
    placeId,
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes validity
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', CLAIM_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
};

/**
 * Verify HMAC claim token
 */
const verifyVenueClaim = (claim, userId, placeId) => {
  if (!claim || typeof claim !== 'string' || !claim.includes('.')) return false;
  try {
    const [payloadStr, signature] = claim.split('.');
    const expectedSig = crypto.createHmac('sha256', CLAIM_SECRET).update(payloadStr).digest('base64url');
    if (signature !== expectedSig) return false;

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (payload.userId !== userId.toString()) return false;
    if (payload.placeId !== placeId) return false;
    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
};

/**
 * Deterministic pseudo-random comparator seeded by session id and place id
 */
const deterministicPlaceSort = (sessionId, placeId) => {
  return (a, b) => {
    const hashA = crypto.createHash('md5').update(`${sessionId}_${placeId}_${a.profileId}`).digest('hex');
    const hashB = crypto.createHash('md5').update(`${sessionId}_${placeId}_${b.profileId}`).digest('hex');
    return hashA.localeCompare(hashB);
  };
};

/**
 * @desc    Search nearby venues with distance rounded to nearest 10m and HMAC claim
 * @route   POST /api/places/nearby-search
 * @access  Private
 */
export const searchNearbyPlaces = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const { latitude, longitude } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Valid latitude and longitude numbers are required.',
      });
    }

    if (isSearchRateLimited(viewerId.toString(), 20)) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_REQUESTS',
        message: 'Nearby search rate limit exceeded (20/hour). Try again later.',
      });
    }

    const allPlaces = await Place.find().lean();
    if (!allPlaces || allPlaces.length === 0) {
      return res.status(200).json({
        success: true,
        data: { items: [] },
      });
    }

    // Calculate distance, round to nearest 10m, sort ascending, up to 8 venues
    const mapped = allPlaces.map((p) => {
      const rawDistance = calculateHaversineMeters(latitude, longitude, p.latitude, p.longitude);
      const approxDistanceMeters = Math.round(rawDistance / 10) * 10;
      const claim = createVenueClaim(viewerId, p.id);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        approxDistanceMeters,
        claim,
      };
    });

    mapped.sort((a, b) => a.approxDistanceMeters - b.approxDistanceMeters);
    const items = mapped.slice(0, 8);

    res.status(200).json({
      success: true,
      data: {
        items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get popular venues (fallback without distances)
 * @route   GET /api/places/popular
 * @access  Private
 */
export const getPopularPlaces = async (req, res, next) => {
  try {
    const places = await Place.find().limit(20).lean();

    const items = places.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
    }));

    res.status(200).json({
      success: true,
      data: {
        items,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Start Place Mode session
 * @route   POST /api/places/sessions
 * @access  Private
 */
export const startPlaceSession = async (req, res, next) => {
  try {
    const viewerId = req.user._id;
    const { placeId, durationMinutes, claim, consentAcknowledged } = req.body;

    const user = await User.findById(viewerId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'User not found.',
      });
    }

    const locationAllowed = !user.hideProfile && (user.locationDiscoveryEnabled ?? true);
    if (!locationAllowed) {
      return res.status(403).json({
        success: false,
        code: 'LOCATION_DISCOVERY_DISABLED',
        message: 'Location discovery is disabled in your privacy settings.',
      });
    }

    // Consent check
    const existingConsent = await PlaceConsent.findOne({ userId: viewerId });
    if (!existingConsent) {
      if (consentAcknowledged !== true) {
        return res.status(422).json({
          success: false,
          code: 'CONSENT_REQUIRED',
          message: 'Place Mode requires explicit user consent.',
        });
      }
      await PlaceConsent.create({
        userId: viewerId,
        type: 'place',
        acknowledgedAt: new Date(),
      });
    }

    if (!placeId) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'placeId is required.',
      });
    }

    if (![30, 60, 120].includes(Number(durationMinutes))) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'durationMinutes must be 30, 60, or 120.',
      });
    }

    const venue = await Place.findOne({ id: placeId });
    if (!venue) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Venue not found in catalog.',
      });
    }

    // Verification check via HMAC claim
    const hasValidClaim = verifyVenueClaim(claim, viewerId, placeId);
    const verified = hasValidClaim;

    if (!verified) {
      // Unverified start: allowed up to 3 per day per user, 4th gets 429
      const allowed = checkAndIncrementUnverifiedStarts(viewerId.toString());
      if (!allowed) {
        res.setHeader('Retry-After', '86400');
        return res.status(429).json({
          success: false,
          code: 'TOO_MANY_REQUESTS',
          message: 'Daily unverified place session limit reached (maximum 3 per day).',
        });
      }
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

    // One active place session per user: replace old one
    await PlaceSession.deleteMany({ userId: viewerId });

    const session = await PlaceSession.create({
      userId: viewerId,
      placeId: venue.id,
      placeName: venue.name,
      category: venue.category,
      durationMinutes: Number(durationMinutes),
      verified,
      startedAt,
      expiresAt,
    });

    // Invalidate cache
    placeCache.delete(viewerId.toString());

    // Hook B8 Crossed Paths encounter recording
    await recordEncounters(viewerId, session);

    res.status(201).json({
      success: true,
      data: {
        session: {
          id: session._id.toString(),
          placeId: session.placeId,
          placeName: session.placeName,
          category: session.category,
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
 * @desc    Get current active Place session
 * @route   GET /api/places/sessions/current
 * @access  Private
 */
export const getCurrentPlaceSession = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const session = await PlaceSession.findOne({
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
          placeId: session.placeId,
          placeName: session.placeName,
          category: session.category,
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
 * @desc    End current Place session immediately
 * @route   DELETE /api/places/sessions/current
 * @access  Private
 */
export const stopPlaceSession = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    await PlaceSession.deleteMany({ userId: viewerId });
    placeCache.delete(viewerId.toString());

    res.status(200).json({
      success: true,
      message: 'Place session ended.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get people at the same place with anti-trilateration (<2 returns nobodyToShow)
 * @route   GET /api/places/people
 * @access  Private
 */
export const getPlacePeople = async (req, res, next) => {
  try {
    const viewerId = req.user._id;

    const session = await PlaceSession.findOne({
      userId: viewerId,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACTIVE_SESSION',
        message: 'No active place session found.',
      });
    }

    // 15-second refresh cache
    const cacheKey = viewerId.toString();
    const cached = placeCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < 15000) {
      return res.status(200).json({
        success: true,
        data: cached.data,
      });
    }

    const user = await User.findById(viewerId);

    // Find active sessions at the exact SAME place
    const activeSessions = await PlaceSession.find({
      userId: { $ne: viewerId },
      placeId: session.placeId,
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

    // Anti-trilateration rule: Fewer than 2 eligible returns nobodyToShow with empty items
    let responseData;
    if (eligibleItems.length < 2) {
      responseData = {
        status: 'nobodyToShow',
        items: [],
      };
    } else {
      // Deterministic shuffle seeded by session ID and place ID, capped at 20
      eligibleItems.sort(deterministicPlaceSort(session._id.toString(), session.placeId));
      responseData = {
        status: 'peopleHere',
        items: eligibleItems.slice(0, 20),
      };
    }

    placeCache.set(cacheKey, {
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
