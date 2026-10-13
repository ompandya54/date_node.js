import Encounter from '../models/encounter.model.js';
import User from '../models/user.model.js';
import { NearbySession } from '../models/nearby.model.js';
import { PlaceSession } from '../models/place.model.js';
import { canSee, getGeohashAdjacentCells } from './shared.utils.js';

/**
 * Server-side hook: recordEncounters(userId, session)
 * Triggered after starting a Nearby (B6) or Place (B7) session.
 */
export const recordEncounters = async (userId, session) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.isActive) return;

    // Must be opt-in: locationAllowed and recordingEnabled
    const isLocationAllowed = !user.hideProfile && (user.locationDiscoveryEnabled ?? true);
    if (!isLocationAllowed || user.recordingEnabled === false) {
      return;
    }

    const now = new Date();
    // Round down to the current hour
    const crossedAt = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
    const expiresAt = new Date(crossedAt.getTime() + 24 * 60 * 60 * 1000);

    let candidateUserIds = [];

    if (session.cell) {
      // Nearby session: find active sessions in same or adjacent cells
      const searchCells = getGeohashAdjacentCells(session.cell);
      const activeNearby = await NearbySession.find({
        userId: { $ne: user._id },
        cell: { $in: searchCells },
        expiresAt: { $gt: now },
      }).lean();

      candidateUserIds = activeNearby.map((s) => s.userId.toString());
    } else if (session.placeId) {
      // Place session: find active sessions at the same place
      const activePlace = await PlaceSession.find({
        userId: { $ne: user._id },
        placeId: session.placeId,
        expiresAt: { $gt: now },
      }).lean();

      candidateUserIds = activePlace.map((s) => s.userId.toString());
    }

    if (candidateUserIds.length === 0) return;

    // Filter candidate users
    const uniqueCandidateIds = [...new Set(candidateUserIds)];
    const candidates = await User.find({
      _id: { $in: uniqueCandidateIds },
      isActive: true,
      onboardingCompleted: true,
      recordingEnabled: { $ne: false },
    });

    let createdCount = 0;
    const maxEncountersPerStart = 5;

    for (const candidate of candidates) {
      if (createdCount >= maxEncountersPerStart) break;

      const candLocationAllowed = !candidate.hideProfile && (candidate.locationDiscoveryEnabled ?? true);
      if (!candLocationAllowed) continue;

      // Check mutual visibility & block
      if (!canSee(user, candidate, true)) continue;

      // Check not already matched
      const userMatches = (user.matches || []).map((id) => id.toString());
      if (userMatches.includes(candidate._id.toString())) continue;

      // Check if encounter already created for this pair in the same hour
      const existing = await Encounter.findOne({
        ownerUserId: user._id,
        otherUserId: candidate._id,
        crossedAt,
      });

      if (!existing) {
        // Create bidirectional encounters (A sees B, B sees A)
        // Strictly stores ONLY: ownerUserId, otherUserId, crossedAt, expiresAt, seen, interestExpressed
        await Encounter.create([
          {
            ownerUserId: user._id,
            otherUserId: candidate._id,
            crossedAt,
            expiresAt,
            seen: false,
            interestExpressed: false,
          },
          {
            ownerUserId: candidate._id,
            otherUserId: user._id,
            crossedAt,
            expiresAt,
            seen: false,
            interestExpressed: false,
          },
        ]);

        createdCount++;
      }
    }
  } catch (error) {
    console.error(`[recordEncounters Error for ${userId}]:`, error.message);
  }
};
