import { destinationPacks, mockItinerary } from "@/data/mock-trip";
import type {
  BookingChecklistItem,
  DestinationPack,
  Itinerary,
  MapPlace,
  PlaceCategory,
  UserProfile,
} from "@/types/trip";

export interface TripSummary {
  id: string;
  title: string;
  dates: string;
  destinationPackId: string;
  status: "draft" | "ready";
  updatedAt: string;
}

export interface MemorySearchRequest {
  query?: string;
  destinationPackId?: string;
  scopes?: Array<"profile" | "destination" | "itinerary" | "place">;
  limit?: number;
}

export interface MemorySearchResult {
  id: string;
  scope: "profile" | "destination" | "itinerary" | "place";
  title: string;
  snippet: string;
  source: string;
  score: number;
}

export interface AgentPlanRequest {
  prompt?: string;
  destinationPackId?: string;
  profile?: Partial<UserProfile>;
}

const nowIso = () => new Date().toISOString();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const tripStore = new Map<string, Itinerary>([[mockItinerary.id, clone(mockItinerary)]]);
const tripUpdatedAt = new Map<string, string>([[mockItinerary.id, nowIso()]]);
let userProfile: UserProfile = clone(mockItinerary.profile);

function itinerarySummary(trip: Itinerary): TripSummary {
  return {
    id: trip.id,
    title: trip.title,
    dates: trip.dates,
    destinationPackId: trip.destinationPackId,
    status: "ready",
    updatedAt: tripUpdatedAt.get(trip.id) ?? nowIso(),
  };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function scoreText(query: string, fields: string[]) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 1;

  const haystack = normalizeText(fields.join(" "));
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches = terms.filter((term) => haystack.includes(term)).length;

  if (haystack.includes(normalizedQuery)) return 1;
  if (matches === 0) return 0;
  return Number((matches / terms.length).toFixed(2));
}

export function listTripSummaries() {
  return Array.from(tripStore.values()).map(itinerarySummary);
}

export function getTrip(tripId: string) {
  const trip = tripStore.get(tripId);
  return trip ? clone(trip) : null;
}

export function saveTrip(candidate: Partial<Itinerary> | null) {
  const base = clone(mockItinerary);
  const trip: Itinerary = {
    ...base,
    ...candidate,
    id: candidate?.id ?? `trip-${Date.now()}`,
    profile: {
      ...base.profile,
      ...candidate?.profile,
    },
    places: candidate?.places ?? base.places,
    days: candidate?.days ?? base.days,
    bookingChecklist: candidate?.bookingChecklist ?? base.bookingChecklist,
  };

  tripStore.set(trip.id, clone(trip));
  tripUpdatedAt.set(trip.id, nowIso());
  return clone(trip);
}

export function updateTrip(tripId: string, patch: Partial<Itinerary>) {
  const current = tripStore.get(tripId);
  if (!current) return null;

  const next: Itinerary = {
    ...current,
    ...patch,
    id: current.id,
    profile: patch.profile ? { ...current.profile, ...patch.profile } : current.profile,
    summary: patch.summary ? { ...current.summary, ...patch.summary } : current.summary,
  };

  tripStore.set(tripId, clone(next));
  tripUpdatedAt.set(tripId, nowIso());
  return clone(next);
}

export function getProfile() {
  return clone(userProfile);
}

export function updateProfile(patch: Partial<UserProfile> | null) {
  if (!patch) return null;

  userProfile = {
    ...userProfile,
    ...patch,
    id: userProfile.id,
  };

  return clone(userProfile);
}

export function listDestinationPacks() {
  return clone(destinationPacks);
}

export function getDestinationPack(packId: string): DestinationPack | null {
  return clone(destinationPacks.find((pack) => pack.id === packId) ?? null);
}

export function listPlaces(options: {
  tripId?: string | null;
  query?: string | null;
  category?: PlaceCategory | null;
}) {
  const sourceTrip = options.tripId ? tripStore.get(options.tripId) : tripStore.values().next().value;
  const places = sourceTrip?.places ?? [];
  const query = normalizeText(options.query ?? "");

  return clone(
    places.filter((place) => {
      const categoryMatches = !options.category || place.category === options.category;
      const queryMatches =
        !query ||
        [place.name, place.neighborhood, place.whyItFits, place.source]
          .map(normalizeText)
          .some((field) => field.includes(query));

      return categoryMatches && queryMatches;
    }),
  ) as MapPlace[];
}

export function getBookingChecklist(tripId: string) {
  const trip = tripStore.get(tripId);
  return trip ? clone(trip.bookingChecklist) : null;
}

export function updateBookingChecklistItem(
  tripId: string,
  itemId: string,
  patch: Partial<BookingChecklistItem>,
) {
  const trip = tripStore.get(tripId);
  if (!trip) return null;

  const itemExists = trip.bookingChecklist.some((item) => item.id === itemId);
  if (!itemExists) return null;

  const nextChecklist = trip.bookingChecklist.map((item) =>
    item.id === itemId ? { ...item, ...patch, id: item.id } : item,
  );

  const nextTrip = { ...trip, bookingChecklist: nextChecklist };
  tripStore.set(tripId, clone(nextTrip));
  tripUpdatedAt.set(tripId, nowIso());

  return clone(nextChecklist.find((item) => item.id === itemId) ?? null);
}

export function searchMemory(request: MemorySearchRequest | null) {
  const query = request?.query?.trim() ?? "";
  const scopes = new Set(request?.scopes ?? ["profile", "destination", "itinerary", "place"]);
  const limit = Math.min(Math.max(request?.limit ?? 6, 1), 20);
  const activePack = getDestinationPack(request?.destinationPackId ?? mockItinerary.destinationPackId);
  const activeTrip = getTrip(mockItinerary.id) ?? mockItinerary;

  const candidates: MemorySearchResult[] = [];

  if (scopes.has("profile")) {
    candidates.push({
      id: `profile:${userProfile.id}`,
      scope: "profile",
      title: `${userProfile.name}'s travel profile`,
      snippet: [
        userProfile.pace,
        userProfile.budget,
        ...userProfile.foodPreferences,
        ...userProfile.interests,
        ...userProfile.constraints,
      ].join(" · "),
      source: "user_profile",
      score: 0,
    });
  }

  if (activePack && scopes.has("destination")) {
    candidates.push({
      id: `destination:${activePack.id}`,
      scope: "destination",
      title: `${activePack.country} destination pack`,
      snippet: [
        ...activePack.regions,
        ...activePack.culturalNotes,
        ...activePack.transportNotes,
        ...activePack.seasonalNotes,
      ].join(" · "),
      source: "destination_pack",
      score: 0,
    });
  }

  if (scopes.has("itinerary")) {
    candidates.push(
      ...activeTrip.days.map((day) => ({
        id: `itinerary:${activeTrip.id}:${day.id}`,
        scope: "itinerary" as const,
        title: day.title,
        snippet: day.segments.map((segment) => segment.description).join(" "),
        source: activeTrip.id,
        score: 0,
      })),
    );
  }

  if (scopes.has("place")) {
    candidates.push(
      ...activeTrip.places.map((place) => ({
        id: `place:${place.id}`,
        scope: "place" as const,
        title: place.name,
        snippet: `${place.neighborhood} · ${place.category} · ${place.whyItFits}`,
        source: place.source,
        score: 0,
      })),
    );
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreText(query, [candidate.title, candidate.snippet, candidate.source]),
    }))
    .filter((candidate) => !query || candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function planTrip(request: AgentPlanRequest | null) {
  const destinationPack =
    getDestinationPack(request?.destinationPackId ?? mockItinerary.destinationPackId) ??
    clone(destinationPacks[0]);

  const itinerary: Itinerary = {
    ...clone(mockItinerary),
    destinationPackId: destinationPack.id,
    profile: {
      ...userProfile,
      ...request?.profile,
    },
    assumptions: [
      ...mockItinerary.assumptions,
      request?.prompt
        ? `Generated from prompt: ${request.prompt}`
        : "Generated from the active Japan destination pack.",
    ],
  };

  return {
    mode: "mock-repository",
    prompt: request?.prompt ?? null,
    destinationPack,
    itinerary,
    nextPersistenceLayer: "MongoDB Atlas",
    nextModelRuntime: "Gemini on Vertex AI",
    nextToolLayer: "MongoDB MCP server",
  };
}
