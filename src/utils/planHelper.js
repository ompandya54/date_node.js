/**
 * Helper utilities for Free Tier vs ₹39 Premium Plan & Free Weekend Chat Rules
 */

// Daily Limits Configuration
export const PLAN_LIMITS = {
  free: {
    maxDailyLikes: 15, // 15 right swipes per day
    maxDailySuperLikes: 1, // 1 super like per day
  },
  premium: {
    maxDailyLikes: 100, // 100 right swipes per day
    maxDailySuperLikes: 5, // 5 super likes per day
  },
};

/**
 * Check and reset daily swipe counters at midnight / new day
 * Also check if premium plan has expired
 * @param {object} user Mongoose user document
 */
export const checkAndResetDailyUsage = async (user) => {
  const now = new Date();

  // 1. Check Premium Expiry
  if (user.plan === 'premium' && user.planExpiresAt && user.planExpiresAt < now) {
    user.plan = 'free';
    user.planExpiresAt = null;
  }

  // 2. Check Daily Reset (if last reset was on a previous calendar day)
  const lastReset = user.lastSwipeResetDate ? new Date(user.lastSwipeResetDate) : new Date(0);
  const isSameDay =
    now.getFullYear() === lastReset.getFullYear() &&
    now.getMonth() === lastReset.getMonth() &&
    now.getDate() === lastReset.getDate();

  if (!isSameDay) {
    user.dailySwipeCount = 0;
    user.dailySuperLikeCount = 0;
    user.lastSwipeResetDate = now;
  }
};

/**
 * Check if user is eligible to send text messages based on Plan & Weekend Promo
 * @param {object} user User object
 * @returns {object} { canChat: boolean, isWeekend: boolean, reason: string }
 */
export const canUserSendChat = (user) => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // 1. Premium users get 24/7 unlimited chat access on all days
  if (user.plan === 'premium') {
    return {
      canChat: true,
      isWeekend,
      reason: 'Unlimited Premium Chat Active',
    };
  }

  // 2. Free users get FREE CHAT ACCESS on Saturdays & Sundays!
  if (isWeekend) {
    return {
      canChat: true,
      isWeekend: true,
      reason: 'Free Weekend Chat Active! 🎉 Enjoy chatting every Saturday & Sunday.',
    };
  }

  // 3. Mon-Fri Free Users CANNOT text
  return {
    canChat: false,
    isWeekend: false,
    reason:
      'Mon-Fri chatting is reserved for ₹39 Premium members. Enjoy Free Chatting on Saturdays & Sundays, or Upgrade to Premium for 24/7 access!',
  };
};
