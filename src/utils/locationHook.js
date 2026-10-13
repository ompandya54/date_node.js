/**
 * Hook called when a user's locationAllowed setting becomes false.
 * Will end active Nearby & Place sessions and turn off Crossed Paths recording in B6-B8.
 */
export const onLocationAllowedChanged = async (userId) => {
  console.log(`[Location Hook] onLocationAllowedChanged triggered for user: ${userId}`);
  // Hooks for B6, B7, B8 will be wired here as those modules are implemented
};
