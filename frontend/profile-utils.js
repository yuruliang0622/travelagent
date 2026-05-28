(function () {
const USER_PROFILE_STORAGE_KEY = "trip-agent:user-profile";
const PROFILE_SCHEMA_VERSION = "v4";

function splitProfileList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePace(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["relaxed", "balanced", "packed"].includes(normalized)) return normalized;
  if (normalized.includes("relax") || normalized.includes("slow") || normalized.includes("easy")) return "relaxed";
  if (normalized.includes("packed") || normalized.includes("highlight") || normalized.includes("ambitious")) return "packed";
  return "balanced";
}

function normalizeTravelers(value, fallback = 1) {
  const s = String(value || "").trim().toLowerCase();
  if (/solo/i.test(s)) return 1;
  if (/family/i.test(s)) return 4;
  const parsed = Number.parseInt(s, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.min(20, safe || 1));
}

function normalizeList(value) {
  return splitProfileList(value);
}

function loadUserProfile() {
  try {
    if (!window.localStorage) return null;
    const raw = JSON.parse(window.localStorage.getItem(USER_PROFILE_STORAGE_KEY)) || null;
    if (!raw) return null;

    if (raw._schemaVersion !== PROFILE_SCHEMA_VERSION) {
      window.localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
      return null;
    }

    const { destination, tripRequest, tripLength, travelMonth, completed, _schemaVersion, ...prefs } = raw;
    return Object.keys(prefs).length ? prefs : null;
  } catch {
    return null;
  }
}

function saveUserProfileLocal(nextProfile) {
  window.localStorage?.setItem(
    USER_PROFILE_STORAGE_KEY,
    JSON.stringify({ ...stableProfileMemory(nextProfile), _schemaVersion: PROFILE_SCHEMA_VERSION })
  );
}

function stableProfileMemory(profile) {
  return {
    id: profile?.id || "primary",
    name: profile?.name || "Traveler",
    email: profile?.email || "",
    homeAirport: profile?.homeAirport || profile?.home_airport || "",
    passportCountry: profile?.passportCountry || profile?.passport_country || "United States",
    travelers: normalizeTravelers(profile?.travelers, 1),
    budget: profile?.budget || "Moderate",
    pace: normalizePace(profile?.pace || profile?.travelVibe || profile?.travelStyle),
    foodPreferences: splitProfileList(profile?.foodPreferences || profile?.food_preferences),
    memoryConsent: Boolean(profile?.memoryConsent ?? true),
    profileSetupComplete: Boolean(profile?.profileSetupComplete),
    updatedAt: profile?.updatedAt || new Date().toISOString(),
  };
}

function clearUserProfileLocal() {
  window.localStorage?.removeItem(USER_PROFILE_STORAGE_KEY);
}

function profileForApi(profile) {
  // Always coerce list fields to real arrays. The chat interview stores single
  // picks as plain strings (e.g. foodPreferences = "Vegetarian"), but the
  // backend expects list[str] — splitProfileList handles strings, arrays, undefined.
  return {
    id: profile?.id || "primary",
    name: profile?.name || "Traveler",
    email: profile?.email || "",
    home_airport: profile?.homeAirport || "",
    passport_country: profile?.passportCountry || "United States",
    travelers: normalizeTravelers(profile?.travelers, 1),
    budget: profile?.budget || "Moderate",
    pace: normalizePace(profile?.pace || profile?.travelVibe || profile?.travelStyle),
    food_preferences: splitProfileList(profile?.foodPreferences || profile?.food_preferences),
    interests: [],
    constraints: [],
    hotel_preferences: [],
    memory_consent: Boolean(profile?.memoryConsent ?? true),
  };
}

function planProfilePayload(userProfile, trip) {
  return {
    id: userProfile?.id || "primary",
    name: userProfile?.name || "Traveler",
    email: userProfile?.email || "",
    home_airport: userProfile?.homeAirport || "",
    passport_country: userProfile?.passportCountry || "United States",
    travelers: normalizeTravelers(userProfile?.travelers, trip.travelers || 1),
    budget: userProfile?.budget || "Moderate",
    pace: normalizePace(userProfile?.pace || userProfile?.travelVibe || userProfile?.travelStyle),
    travel_month: userProfile?.travelMonth || userProfile?.tripRequest?.month || "",
    food_preferences: [
      ...normalizeList(userProfile?.foodPreferences || userProfile?.food_preferences),
      ...(userProfile?.cuisineStyle ? [userProfile.cuisineStyle] : []),
      ...(userProfile?.diningStyle ? [userProfile.diningStyle] : []),
    ].filter(Boolean),
    interests: normalizeList(userProfile?.interestList || userProfile?.interests),
    constraints: [
      ...normalizeList(userProfile?.constraintsList || userProfile?.constraints),
      ...(userProfile?.flightFlexibility ? [`Flight dates: ${userProfile.flightFlexibility}`] : []),
    ].filter(Boolean),
    hotel_preferences: [
      ...normalizeList(userProfile?.hotelPreferences || userProfile?.hotel_preferences),
      ...(userProfile?.stayType ? [userProfile.stayType] : []),
      ...(userProfile?.neighborhoodStyle ? [userProfile.neighborhoodStyle] : []),
    ].filter(Boolean),
    selectedFlight: userProfile?.selectedFlight || null,
    memory_consent: Boolean(userProfile?.memoryConsent ?? true),
  };
}

window.TripProfile = {
  loadUserProfile,
  saveUserProfileLocal,
  clearUserProfileLocal,
  splitProfileList,
  normalizePace,
  normalizeTravelers,
  normalizeList,
  stableProfileMemory,
  profileForApi,
  planProfilePayload,
};
})();
