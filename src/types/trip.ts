export type Pace = "relaxed" | "balanced" | "packed";

export type PlaceCategory =
  | "airport"
  | "hotel"
  | "restaurant"
  | "attraction"
  | "shopping"
  | "transit"
  | "culture"
  | "wellness";

export type BookingStatus = "ready" | "needs-review" | "optional" | "later";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  homeAirport: string;
  passportCountry: string;
  travelers: number;
  budget: string;
  pace: Pace;
  foodPreferences: string[];
  interests: string[];
  constraints: string[];
  hotelPreferences: string[];
  accessibilityNeeds: string[];
  memoryConsent: boolean;
}

export interface DestinationPack {
  id: string;
  country: string;
  launchStatus: "active" | "planned";
  regions: string[];
  culturalNotes: string[];
  transportNotes: string[];
  seasonalNotes: string[];
}

export interface MapPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  neighborhood: string;
  lat: number;
  lng: number;
  cost: string;
  duration: string;
  source: string;
  whyItFits: string;
  googleMapsUrl: string;
}

export interface ItinerarySegment {
  time: string;
  title: string;
  description: string;
  placeIds: string[];
  travelNote: string;
  cost: string;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date: string;
  title: string;
  area: string;
  color: string;
  segments: ItinerarySegment[];
  placeIds: string[];
}

export interface BookingChecklistItem {
  id: string;
  type: "flight" | "hotel" | "restaurant" | "ticket" | "calendar";
  title: string;
  provider: string;
  status: BookingStatus;
  deadline: string;
  actionLabel: string;
  handoffUrl: string;
}

export interface Itinerary {
  id: string;
  title: string;
  subtitle: string;
  dates: string;
  destinationPackId: string;
  summary: {
    hotel: string;
    flights: string;
    transit: string;
    budget: string;
  };
  profile: UserProfile;
  places: MapPlace[];
  days: ItineraryDay[];
  reminders: {
    title: string;
    items: string[];
  }[];
  bookingChecklist: BookingChecklistItem[];
  assumptions: string[];
}
