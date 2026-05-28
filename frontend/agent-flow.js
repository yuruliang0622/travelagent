(function () {
// AgentChat flow config and pure helpers. Keep backend calls in api.js and UI in agent-chat.jsx.

const AGENT_GROUNDING_RULES = [
  "If important trip details are missing or uncertain, do not guess or invent them.",
  "Ask one concise follow-up question instead and offer 3-6 concrete choices for the traveler to select.",
  "Only generate a plan after destination, travel dates, route style, and interest preferences are clear.",
].join(" ");

// ── Phase 1: Flight-first + Claude-style route interview ────────────────────
const PROFILE_STEPS = [
  // Flight Agent — most travelers anchor the trip with flights first.
  {
    key: "destination",
    agentLabel: "Flight Agent", agentEmoji: "✈️",
    question: "Where are you thinking of going?",
    placeholder: "Choose a destination",
    options: ["Japan curated demo", "Paris preview", "Rome preview", "Barcelona preview", "London preview"],
  },
  {
    key: "travelDates", agentLabel: "Flight Agent", agentEmoji: "✈️",
    question: "What dates should I check?",
    placeholder: "Choose departure and return dates",
    inputType: "dateRange",
  },

  // Route Agent — after flight options, shape the route before food/details.
  {
    key: "interestMix",
    agentLabel: "Plan Agent", agentEmoji: "🗺",
    question: "What should I make room for? Pick anything that sounds like you.",
    placeholder: "Choose interests",
    inputType: "multiSelect",
    options: ["Traditional culture", "Nature + scenic views", "Shopping + design", "Anime / pop culture", "Food highlights", "Onsen / ryokan"],
  },
];

// ── Phase 2: Booking specialist interviews (triggered after plan approval) ───
const FLIGHT_BOOKING_STEPS = [
  {
    key: "homeAirport", agentLabel: "Flight Agent", agentEmoji: "✈️",
    question: "What's your home airport?",
    options: ["New York (JFK / EWR)", "Los Angeles (LAX)", "San Francisco (SFO)", "Chicago (ORD)", "Miami (MIA)", "London (LHR)"],
  },
  {
    key: "travelDates", agentLabel: "Flight Agent", agentEmoji: "✈️",
    question: "What dates should I search?",
    placeholder: "Choose departure and return dates",
    inputType: "dateRange",
  },
];

const HOTEL_BOOKING_STEPS = [
  {
    key: "budget", agentLabel: "Hotel Agent", agentEmoji: "🏨",
    question: "What's your budget style?",
    options: ["Budget-friendly", "Moderate", "Comfortable", "Luxury"],
  },
  {
    key: "stayType", agentLabel: "Hotel Agent", agentEmoji: "🏨",
    question: "What type of place do you prefer to stay?",
    options: ["Full-service hotel", "Boutique hotel", "Apartment-style", "Ryokan or local stay", "Cheapest clean option"],
  },
];

const PLAN_CONFIRM_OPTIONS = [
  "Looks great — let's book! ✅",
  "I'd like to adjust something ✏️",
];

const HOTEL_ONLY_BOOKING_OPTIONS = [
  "Find hotels 🏨",
  "I'll handle it myself",
];

const FULL_BOOKING_OPTIONS = [
  "Book flights ✈️",
  "Find hotels 🏨",
  "Book both flights and hotels",
  "I'll handle it myself",
];

const DESTINATION_OPTIONS = [
  "Japan curated demo",
  "Paris preview",
  "Rome preview",
  "Barcelona preview",
  "London preview",
];

const US_REGION_OPTIONS = [
  "New York City",
  "California coast",
  "Utah national parks",
  "Florida beaches",
  "Pacific Northwest",
  "Hawaii",
];

function nextProfileStep(profile) {
  return PROFILE_STEPS.find((step) => {
    const val = profile?.[step.key];
    if (Array.isArray(val)) return val.length === 0;
    return !val;
  }) || null;
}

function nextSessionStep(answers) {
  return PROFILE_STEPS.find((step) => !answers[step.key]) || null;
}

function profileGreeting() {
  const firstStep = PROFILE_STEPS[0];
  return {
    role: "assistant",
    content: `Hi, I’m Reiko. I’ll keep this simple: first I’ll anchor the trip with real flight options, then I’ll shape a route that actually works on the ground.\n\n${firstStep.question}`,
  };
}

function profileContext(userProfile) {
  if (!userProfile) return "Traveler profile: not collected yet.";
  const entries = [
    ["Name", userProfile.name],
    ["Email", userProfile.email],
    ["Trip length", userProfile.tripLength],
    ["Travel timing", userProfile.travelMonth],
    ["Home airport", userProfile.homeAirport],
    ["Departure date", userProfile.departureDate || userProfile.tripRequest?.startDate],
    ["Return date", userProfile.returnDate || userProfile.tripRequest?.endDate],
    ["Selected flight", userProfile.selectedFlight ? [userProfile.selectedFlight.airline || "Selected flight", userProfile.selectedFlight.origin, "to", userProfile.selectedFlight.destination].filter(Boolean).join(" ") : ""],
    ["Budget", userProfile.budget],
    ["Food preferences", Array.isArray(userProfile.foodPreferences) ? userProfile.foodPreferences.join(", ") : userProfile.foodPreferences],
    ["Travelers", userProfile.travelers],
    ["Travel style", userProfile.travelStyle],
    ["Interests", Array.isArray(userProfile.interestList) ? userProfile.interestList.join(", ") : userProfile.interests],
  ].filter(([, value]) => value);
  return `Traveler profile:\n${entries.map(([key, value]) => `${key}: ${value}`).join("\n")}`;
}

function looksLikePlanRequest(text) {
  return /\b(plan|build|generate|create|itinerary|trip|travel)\b/i.test(text);
}


function destinationFromText(text) {
  if (/\b(us|usa|u\.s\.|united states|america)\b/i.test(text)) return "United States";
  const match = text.match(/\b(?:in|to|for)\s+([A-Z][A-Za-z\s,.'-]{2,})(?:\s+for\s+me|\s+trip|\s+plan|\s+itinerary|$)/i);
  return match?.[1]?.trim() || "";
}

function isBroadUsDestination(destination) {
  return /^(us|usa|u\.s\.|united states|america)$/i.test(String(destination || "").trim());
}

function isLivePlanMode(mode) {
  return mode === "gemini" || mode === "gemini-function-calling";
}

function normalizeDestinationName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(the|trip|plan|itinerary|demo|first|timer|route)\b/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

function returnedDifferentDestination(data, requestedDestination) {
  const requested = normalizeDestinationName(requestedDestination);
  if (!requested) return false;
  const returned = normalizeDestinationName(
    data?.destination_pack?.country || data?.itinerary?.destination_pack_id || data?.itinerary?.title
  );
  return returned && !returned.includes(requested) && !requested.includes(returned);
}

function backendFallbackMessage(destination) {
  return `The backend returned the Japan demo, not ${destination}. I did not update the trip.`;
}

function missingPlanStep(text, profile, sessionAnswers) {
  // Prefer destination from the current message; fall back to what was collected this session.
  const destination = destinationFromText(text) || sessionAnswers?.destination || profile?.destination || profile?.tripRequest?.destination;
  if (!destination) {
    return {
      key: "destination",
      question: "Where do you want to go?",
      options: DESTINATION_OPTIONS,
    };
  }
  if (isBroadUsDestination(destination) && !sessionAnswers?.destination) {
    return {
      key: "destination",
      question: "Which US area?",
      options: US_REGION_OPTIONS,
    };
  }
  // Use session answers to check remaining steps — don't rely on localStorage-persisted preferences.
  return nextSessionStep(sessionAnswers || {});
}

function daysFromText(text, fallback = 5) {
  const rangeMatch = text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*(day|days)/i);
  if (rangeMatch) {
    const value = Number(rangeMatch[2]);
    return Math.max(1, Math.min(30, value || fallback));
  }
  if (/two weeks/i.test(text)) return 14;
  const match = text.match(/(\d{1,2})\s*(day|days)/i);
  if (!match) return fallback;
  const value = Number(match[1]);
  return Math.max(1, Math.min(30, value || fallback));
}

function parseTravelDateRange(text) {
  const matches = String(text || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
  const departureDate = matches[0] || "";
  const returnDate = matches[1] || "";
  const start = departureDate ? new Date(`${departureDate}T00:00:00`) : null;
  const end = returnDate ? new Date(`${returnDate}T00:00:00`) : null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = start && end && end >= start ? Math.max(1, Math.round((end - start) / msPerDay) + 1) : null;
  const month = start ? start.toLocaleString("en-US", { month: "long", year: "numeric" }) : "";
  return { departureDate, returnDate, days, month };
}

// Common major cities by country — used as a fallback when the destination_pack
// regions list doesn't include a city Gemini mentioned (e.g. Nara isn't in the
// Japan pack regions but a Tokyo→Kyoto trip might add a Nara day trip).
const KNOWN_CITIES = [
  "Tokyo", "Kyoto", "Osaka", "Nara", "Hakone", "Sapporo", "Hiroshima", "Yokohama", "Nagoya", "Fukuoka",
  "Bangkok", "Chiang Mai", "Chiang Rai", "Phuket", "Krabi", "Pattaya", "Ayutthaya",
  "Rome", "Florence", "Venice", "Milan", "Naples", "Pisa", "Bologna", "Siena", "Cinque Terre",
  "New York", "Brooklyn", "Manhattan", "Queens",
  "Paris", "Lyon", "Nice", "Marseille", "Bordeaux",
  "Seoul", "Busan", "Jeju", "Incheon",
  "London", "Edinburgh", "Bath", "Oxford",
  "Barcelona", "Madrid", "Seville", "Granada",
];

function citiesForDay(day, knownCities) {
  const haystack = [
    day.title || "",
    day.area || "",
    ...(day.segments || []).flatMap((s) => [s.title || "", s.travel_note || ""]),
  ].join(" ");

  // Preserve order of first appearance
  const seen = new Set();
  const found = [];
  for (const city of knownCities) {
    const pattern = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(haystack) && !seen.has(city)) {
      seen.add(city);
      found.push(city);
    }
  }

  // Sort by first index of appearance to keep "Tokyo → Kyoto" ordering correct
  found.sort((a, b) => haystack.toLowerCase().indexOf(a.toLowerCase()) - haystack.toLowerCase().indexOf(b.toLowerCase()));
  return found;
}

// Return city-by-city breakdown for hotel search fan-out.
// Returns [{ city: "Tokyo", nights: 3 }, ...] ordered by night count desc.
// Falls back to [{ city: destination, nights: total }] if no cities detected.
function tripCityBreakdown(itinerary, fallbackDestination) {
  if (!itinerary?.days) return fallbackDestination ? [{ city: fallbackDestination, nights: 1 }] : [];
  const knownCities = KNOWN_CITIES;
  const days = (itinerary.days || []).filter((d) => d.day_number > 0);
  const counts = new Map();
  for (const day of days) {
    const cities = citiesForDay(day, knownCities);
    if (cities.length === 0) continue;
    // Credit the LAST city of the day (where you sleep)
    const sleepCity = cities[cities.length - 1];
    counts.set(sleepCity, (counts.get(sleepCity) || 0) + 1);
  }
  if (counts.size === 0) {
    const total = days.length || 1;
    return fallbackDestination ? [{ city: fallbackDestination, nights: total }] : [];
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([city, nights]) => ({ city, nights }));
}

window.TripAgentFlow = {
  AGENT_GROUNDING_RULES,
  PROFILE_STEPS,
  FLIGHT_BOOKING_STEPS,
  HOTEL_BOOKING_STEPS,
  PLAN_CONFIRM_OPTIONS,
  BOOKING_NEXT_OPTIONS: HOTEL_ONLY_BOOKING_OPTIONS,
  HOTEL_ONLY_BOOKING_OPTIONS,
  FULL_BOOKING_OPTIONS,
  DESTINATION_OPTIONS,
  US_REGION_OPTIONS,
  nextProfileStep,
  nextSessionStep,
  profileGreeting,
  profileContext,
  looksLikePlanRequest,
  destinationFromText,
  isBroadUsDestination,
  isLivePlanMode,
  normalizeDestinationName,
  returnedDifferentDestination,
  backendFallbackMessage,
  missingPlanStep,
  daysFromText,
  parseTravelDateRange,
  tripCityBreakdown
};
})();
