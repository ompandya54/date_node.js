import { INTERESTS_CATALOG } from '../controllers/meta.controller.js';

// Exact enums defined in Document 0 Section 5
export const GENDER_ENUM = ['man', 'woman', 'nonBinary'];
export const DATING_INTENT_ENUM = ['longTermRelationship', 'shortTermFun', 'friendship', 'stillFiguring'];
export const HABIT_ENUM = ['never', 'socially', 'regularly'];
export const REPORT_REASON_ENUM = ['fakeProfile', 'inappropriatePhotos', 'harassment', 'spam', 'underage', 'other'];
export const NOTIFICATION_TYPE_ENUM = ['newLike', 'newMatch', 'newMessage', 'icebreakerAnswered'];
export const SESSION_DURATIONS = [30, 60, 120];
export const PLACE_CATEGORY_ENUM = ['cafe', 'restaurant', 'park', 'cinema', 'mall', 'other'];

/**
 * Format MyProfile (for current authenticated user)
 */
export const formatMyProfile = (user) => {
  if (!user || !user.onboardingCompleted) return null;

  const dobStr = user.dateOfBirth
    ? new Date(user.dateOfBirth).toISOString().split('T')[0]
    : null;

  return {
    id: user._id.toString(),
    name: user.name || '',
    dateOfBirth: dobStr,
    age: user.age || 0,
    gender: user.gender || 'man',
    interestedIn: user.interestedIn || [],
    photos: (user.photos || []).map((p, idx) => {
      if (typeof p === 'object' && p !== null) {
        return { id: p.id || `ph_${idx + 1}`, url: p.url };
      }
      return { id: `ph_${idx + 1}`, url: p };
    }),
    bio: user.bio !== undefined ? user.bio : null,
    interestIds: user.interestIds || user.interests || [],
    datingIntent: user.datingIntent || 'longTermRelationship',
    drinking: user.drinking || null,
    smoking: user.smoking || null,
  };
};

/**
 * Format PublicProfile (what other people see; zero location fields)
 */
export const formatPublicProfile = (candidate, viewer = null) => {
  if (!candidate) return null;

  const candidateInterests = candidate.interestIds || candidate.interests || [];
  const viewerInterests = viewer ? (viewer.interestIds || viewer.interests || []) : [];

  // Compute commonInterestIds server-side
  const commonInterestIds = candidateInterests.filter((id) =>
    viewerInterests.includes(id)
  );

  // Map interest objects with id and label from catalog
  const mappedInterests = candidateInterests.map((id) => {
    const found = INTERESTS_CATALOG.find((item) => item.id === id);
    return { id, label: found ? found.label : id };
  });

  const photoUrls = (candidate.photos || []).map((p) => {
    return typeof p === 'object' && p !== null ? p.url : p;
  });

  return {
    id: candidate._id ? candidate._id.toString() : candidate.id,
    name: candidate.name || '',
    age: candidate.age || 0,
    photoUrls: photoUrls.slice(0, 6),
    bio: candidate.bio !== undefined ? candidate.bio : null,
    interests: mappedInterests,
    datingIntent: candidate.datingIntent || 'longTermRelationship',
    commonInterestIds,
  };
};

/**
 * Shared visibility function: canSee(viewer, candidate)
 * Enforces global privacy, block lists, hideProfile, onboarding and mutual gender preference.
 */
export const canSee = (viewer, candidate, isDiscovery = true) => {
  if (!viewer || !candidate) return false;

  const viewerId = viewer._id ? viewer._id.toString() : viewer.id;
  const candidateId = candidate._id ? candidate._id.toString() : candidate.id;

  // 1. Never see self
  if (viewerId === candidateId) return false;

  // 2. Candidate must be active and onboarding completed
  if (!candidate.isActive || !candidate.onboardingCompleted) return false;

  // 3. Bidirectional block check
  const viewerBlocked = (viewer.blockedUsers || []).map((id) => id.toString());
  const candidateBlocked = (candidate.blockedUsers || []).map((id) => id.toString());

  if (viewerBlocked.includes(candidateId) || candidateBlocked.includes(viewerId)) {
    return false;
  }

  // 4. If discovery surface, honor hideProfile
  if (isDiscovery && candidate.hideProfile === true) {
    return false;
  }

  // 5. Mutual Gender Preference Matching
  const viewerInterestedIn = viewer.interestedIn || ['woman', 'man', 'nonBinary'];
  const candidateInterestedIn = candidate.interestedIn || ['woman', 'man', 'nonBinary'];

  const candidateGender = candidate.gender || 'woman';
  const viewerGender = viewer.gender || 'man';

  const viewerWantsCandidate = viewerInterestedIn.includes(candidateGender);
  const candidateWantsViewer = candidateInterestedIn.includes(viewerGender);

  return viewerWantsCandidate && candidateWantsViewer;
};

/**
 * In-Memory Geohash precision 6 encoder (~1.2km coarse cell)
 * Raw coordinates are converted in memory and immediately discarded.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const encodeGeohash = (lat, lon, precision = 6) => {
  let latMin = -90.0;
  let latMax = 90.0;
  let lonMin = -180.0;
  let lonMax = 180.0;

  let geohash = '';
  let bits = 0;
  let charIdx = 0;
  let isEven = true;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lonMin + lonMax) / 2;
      if (lon > mid) {
        charIdx = (charIdx << 1) | 1;
        lonMin = mid;
      } else {
        charIdx = (charIdx << 1) | 0;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) {
        charIdx = (charIdx << 1) | 1;
        latMin = mid;
      } else {
        charIdx = (charIdx << 1) | 0;
        latMax = mid;
      }
    }

    isEven = !isEven;
    bits++;

    if (bits === 5) {
      geohash += BASE32[charIdx];
      bits = 0;
      charIdx = 0;
    }
  }

  return geohash;
};

export const decodeGeohash = (geohash) => {
  let isEven = true;
  let latMin = -90.0;
  let latMax = 90.0;
  let lonMin = -180.0;
  let lonMax = 180.0;

  for (let i = 0; i < geohash.length; i++) {
    const c = geohash[i];
    const cd = BASE32.indexOf(c);
    if (cd === -1) continue;
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (isEven) {
        const lonMid = (lonMin + lonMax) / 2;
        if (cd & mask) lonMin = lonMid;
        else lonMax = lonMid;
      } else {
        const latMid = (latMin + latMax) / 2;
        if (cd & mask) latMin = latMid;
        else latMax = latMid;
      }
      isEven = !isEven;
    }
  }
  return {
    latitude: (latMin + latMax) / 2,
    longitude: (lonMin + lonMax) / 2,
    latErr: (latMax - latMin) / 2,
    lonErr: (lonMax - lonMin) / 2,
  };
};

export const getGeohashAdjacentCells = (geohash) => {
  if (!geohash) return [];
  const { latitude, longitude, latErr, lonErr } = decodeGeohash(geohash);
  const cells = new Set();
  cells.add(geohash);

  const deltas = [-1, 0, 1];
  for (const dy of deltas) {
    for (const dx of deltas) {
      const neighbor = encodeGeohash(
        latitude + dy * latErr * 2,
        longitude + dx * lonErr * 2,
        geohash.length
      );
      cells.add(neighbor);
    }
  }
  return Array.from(cells);
};

