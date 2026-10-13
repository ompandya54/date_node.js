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

/**
 * @desc    Get system interests catalog
 * @route   GET /api/meta/interests
 * @access  Public
 */
export const getInterestsCatalog = (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      interests: INTERESTS_CATALOG,
    },
  });
};

/**
 * @desc    Get app support configuration (min app version, latest version, features)
 * @route   GET /api/meta/config
 * @access  Public
 */
export const getAppConfig = (req, res) => {
  const premiumEnforced = process.env.PREMIUM_ENFORCEMENT === 'true';

  res.status(200).json({
    success: true,
    data: {
      minAppVersion: process.env.MIN_APP_VERSION || '1.0.0',
      latestAppVersion: process.env.LATEST_APP_VERSION || '1.0.0',
      features: {
        premiumEnforced,
      },
    },
  });
};
