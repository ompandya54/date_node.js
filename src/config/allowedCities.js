/**
 * Configuration for City-Restricted Dating App
 * Primary target city: Gandhinagar, Gujarat, India
 */

// List of allowed city names (case-insensitive)
export const ALLOWED_CITIES = [
  'gandhinagar',
  'ahmedabad', // Optional neighboring city allowance if needed
];

// Target City Center Point (Gandhinagar, Gujarat)
export const TARGET_CITY_CENTER = {
  name: 'Gandhinagar',
  lat: 23.2156,
  lng: 72.6369,
  allowedRadiusKm: 35, // 35 km radius covering Gandhinagar & nearby areas
};

/**
 * Calculate distance between two coordinates in Kilometers (Haversine formula)
 */
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

/**
 * Check if a given city or lat/lng location is eligible for registration
 * @param {string} city - City name
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {object} { isAllowed: boolean, reason: string, distanceKm: number }
 */
export const validateCityLocation = (city, latitude, longitude) => {
  // 1. Check by City Name if provided
  if (city) {
    const cleanCity = city.trim().toLowerCase();
    const isAllowedCity = ALLOWED_CITIES.some((allowed) =>
      cleanCity.includes(allowed)
    );
    if (isAllowedCity) {
      return { isAllowed: true, reason: `Welcome! ${city} is an active dating zone.` };
    }
  }

  // 2. Check by GPS Coordinates if provided
  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      const distance = calculateDistanceKm(
        lat,
        lng,
        TARGET_CITY_CENTER.lat,
        TARGET_CITY_CENTER.lng
      );

      if (distance <= TARGET_CITY_CENTER.allowedRadiusKm) {
        return {
          isAllowed: true,
          reason: `Location verified! You are ${distance.toFixed(1)} km from ${TARGET_CITY_CENTER.name}.`,
          distanceKm: Math.round(distance),
        };
      } else {
        return {
          isAllowed: false,
          reason: `Sorry, our dating app is currently exclusive to Gandhinagar & surrounding areas (${distance.toFixed(1)} km away).`,
          distanceKm: Math.round(distance),
        };
      }
    }
  }

  // Fallback if neither matches
  return {
    isAllowed: false,
    reason: `Registration is currently restricted to Gandhinagar city only.`,
  };
};
