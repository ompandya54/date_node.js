export const INTERESTS_CATALOG = [
  { id: 'coffee', label: 'Coffee' },
  { id: 'chai', label: 'Chai' },
  { id: 'music', label: 'Music' },
  { id: 'travel', label: 'Travel' },
  { id: 'movies', label: 'Movies' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'books', label: 'Books' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'photography', label: 'Photography' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'hiking', label: 'Hiking' },
  { id: 'art', label: 'Art' },
];

export const INTEREST_MAP = Object.fromEntries(
  INTERESTS_CATALOG.map((i) => [i.id, i.label])
);

/**
 * Format user profile for MyProfile schema (Document 0)
 */
export const formatMyProfile = (user) => {
  if (!user.onboardingCompleted) {
    return null;
  }

  let formattedDOB = null;
  if (user.dateOfBirth) {
    const d = new Date(user.dateOfBirth);
    formattedDOB = d.toISOString().split('T')[0];
  }

  const photos = (user.photos || []).map((p, index) => {
    if (typeof p === 'object' && p.id && p.url) {
      return { id: p.id, url: p.url };
    }
    return { id: `ph_${index + 1}`, url: typeof p === 'string' ? p : p.url };
  });

  return {
    id: user._id.toString(),
    name: user.name || '',
    dateOfBirth: formattedDOB,
    age: user.age || null,
    gender: user.gender || null,
    interestedIn: user.interestedIn || [],
    photos,
    bio: user.bio || null,
    interestIds: user.interests || [],
    datingIntent: user.datingIntent || null,
    drinking: user.drinking || null,
    smoking: user.smoking || null,
  };
};

/**
 * Format user profile for PublicProfile schema (Document 0)
 */
export const formatPublicProfile = (candidate, viewer) => {
  const photoUrls = (candidate.photos || []).map((p) =>
    typeof p === 'object' ? p.url : p
  );

  const candidateInterests = candidate.interests || [];
  const viewerInterests = viewer ? viewer.interests || [] : [];

  const interests = candidateInterests.map((id) => ({
    id,
    label: INTEREST_MAP[id] || id,
  }));

  const commonInterestIds = candidateInterests.filter((id) =>
    viewerInterests.includes(id)
  );

  return {
    id: candidate._id.toString(),
    name: candidate.name || '',
    age: candidate.age || null,
    photoUrls,
    bio: candidate.bio || null,
    interests,
    datingIntent: candidate.datingIntent || null,
    commonInterestIds,
  };
};
