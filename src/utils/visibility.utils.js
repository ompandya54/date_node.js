import Block from '../models/block.model.js';

/**
 * Single shared visibility rule function (Document 0 Section 4)
 * Excludes: self, deleted, onboarding-incomplete, blocked (either direction),
 * hidden profiles (for discovery), and enforces mutual gender preference.
 */
export const canSee = async (viewer, candidate, isDiscoverySurface = true) => {
  if (!viewer || !candidate) return false;

  const viewerId = viewer._id.toString();
  const candidateId = candidate._id.toString();

  // 1. Exclude self
  if (viewerId === candidateId) return false;

  // 2. Exclude deleted / inactive
  if (viewer.isActive === false || candidate.isActive === false) return false;

  // 3. Exclude onboarding incomplete
  if (!candidate.onboardingCompleted) return false;

  // 4. Exclude hidden profiles (for discovery surfaces)
  if (isDiscoverySurface && candidate.hideProfile === true) return false;

  // 5. Enforce mutual gender preference
  const viewerInterested = viewer.interestedIn || [];
  const candidateInterested = candidate.interestedIn || [];

  if (
    !candidate.gender ||
    !viewer.gender ||
    !viewerInterested.includes(candidate.gender) ||
    !candidateInterested.includes(viewer.gender)
  ) {
    return false;
  }

  // 6. Exclude blocked (either direction)
  const isBlocked = await Block.findOne({
    $or: [
      { blockerId: viewer._id, blockedId: candidate._id },
      { blockerId: candidate._id, blockedId: viewer._id },
    ],
  });

  if (isBlocked) return false;

  return true;
};
