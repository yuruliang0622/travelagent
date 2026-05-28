from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Pace(StrEnum):
    relaxed = "relaxed"
    balanced = "balanced"
    packed = "packed"


class PlaceCategory(StrEnum):
    airport = "airport"
    hotel = "hotel"
    restaurant = "restaurant"
    attraction = "attraction"
    shopping = "shopping"
    transit = "transit"
    culture = "culture"
    wellness = "wellness"


class BookingStatus(StrEnum):
    ready = "ready"
    needs_review = "needs-review"
    optional = "optional"
    later = "later"


class UserProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = "primary"
    name: str = "Traveler"
    email: str = ""
    home_airport: str = ""
    passport_country: str = "United States"
    travelers: int = Field(default=1, ge=1, le=20)
    budget: str = "Moderate"
    pace: Pace = Pace.balanced
    travel_month: str = ""
    food_preferences: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    hotel_preferences: list[str] = Field(default_factory=list)
    accessibility_needs: list[str] = Field(default_factory=list)
    selected_flight: dict[str, Any] | None = Field(default=None, alias="selectedFlight")
    memory_consent: bool = True

    @field_validator("pace", mode="before")
    @classmethod
    def normalize_pace(cls, value: object) -> object:
        normalized = str(value or "").strip().lower()
        if normalized in {"relaxed", "balanced", "packed"}:
            return normalized
        if any(token in normalized for token in ("relax", "slow", "easy")):
            return "relaxed"
        if any(token in normalized for token in ("packed", "highlight", "ambitious")):
            return "packed"
        return "balanced"


class DestinationPack(BaseModel):
    id: str
    country: str
    launch_status: Literal["active", "planned"]
    regions: list[str]
    cultural_notes: list[str]
    transport_notes: list[str]
    seasonal_notes: list[str]


class MapPlace(BaseModel):
    id: str
    name: str
    category: PlaceCategory
    neighborhood: str
    lat: float
    lng: float
    cost: str
    duration: str
    source: str
    why_it_fits: str
    google_maps_url: str


class ItinerarySegment(BaseModel):
    time: str
    title: str
    description: str
    place_ids: list[str]
    travel_note: str
    cost: str


class ItineraryDay(BaseModel):
    id: str
    day_number: int
    date: str
    title: str
    area: str
    color: str
    segments: list[ItinerarySegment]
    place_ids: list[str]


class ReminderGroup(BaseModel):
    title: str
    items: list[str]


class BookingChecklistItem(BaseModel):
    id: str
    type: Literal["flight", "hotel", "restaurant", "ticket", "calendar"]
    title: str
    provider: str
    status: BookingStatus
    deadline: str
    action_label: str
    handoff_url: str


class BookingChecklistPatch(BaseModel):
    status: BookingStatus | None = None
    deadline: str | None = None
    action_label: str | None = None
    handoff_url: str | None = None


class ItinerarySummary(BaseModel):
    hotel: str
    flights: str
    transit: str
    budget: str


class Itinerary(BaseModel):
    id: str
    title: str
    subtitle: str
    dates: str
    destination_pack_id: str
    summary: ItinerarySummary
    profile: UserProfile
    places: list[MapPlace]
    days: list[ItineraryDay]
    reminders: list[ReminderGroup]
    booking_checklist: list[BookingChecklistItem]
    assumptions: list[str]


class PlanTripRequest(BaseModel):
    prompt: str = ""
    destination: str = ""
    days: int | None = Field(default=None, ge=1, le=30)
    start_date: str = ""
    end_date: str = ""
    destination_pack_id: str | None = None
    profile: UserProfile | None = None
    day_allocation: str = ""


class PlanTripResponse(BaseModel):
    mode: Literal["mock", "gemini", "gemini-function-calling"] = "mock"
    prompt: str
    destination_pack: DestinationPack
    itinerary: Itinerary
    memory_used: bool
    next_integrations: list[str]
    tool_trace: list[str] = Field(default_factory=list)
    place_details: dict[str, dict] = Field(default_factory=dict)


class AgentChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentChatRequest(BaseModel):
    question: str
    trip_context: str = ""
    messages: list[AgentChatMessage] = Field(default_factory=list)


class AgentChatResponse(BaseModel):
    mode: Literal["mock", "gemini"] = "mock"
    answer: str
    tool_trace: list[str] = Field(default_factory=list)


class TripListItem(BaseModel):
    id: str
    title: str
    dates: str
    destination_pack_id: str


class TripListResponse(BaseModel):
    mode: Literal["memory", "mongodb-atlas"] = "memory"
    trips: list[TripListItem]


class SaveTripResponse(BaseModel):
    saved: bool
    trip: Itinerary
    persistence: str


class DestinationPackListResponse(BaseModel):
    destination_packs: list[DestinationPack]


class PlacesResponse(BaseModel):
    places: list[MapPlace]


class BookingChecklistResponse(BaseModel):
    booking_checklist: list[BookingChecklistItem]


class FlightSearchRequest(BaseModel):
    origin: str
    destination: str
    departure_date: str = ""
    return_date: str = ""
    travel_month: str = ""
    travelers: int = Field(default=1, ge=1, le=20)
    cabin: str = "Economy"
    flexibility: str = ""


class FlightOption(BaseModel):
    id: str
    airline: str
    flight_numbers: list[str]
    origin: str
    destination: str
    depart_time: str
    arrive_time: str
    duration: str
    stops: int
    cabin: str
    price_usd: int
    booking_url: str
    notes: list[str] = Field(default_factory=list)
    source: str = "mock-flight-provider"


class FlightSearchResponse(BaseModel):
    mode: Literal["mock", "provider"] = "mock"
    provider: str
    summary: str
    options: list[FlightOption]
    next_step: str


class HotelSearchRequest(BaseModel):
    destination: str
    cities: list[str] = Field(default_factory=list)
    check_in: str = ""
    check_out: str = ""
    nights: int = Field(default=5, ge=1, le=30)
    travelers: int = Field(default=1, ge=1, le=20)
    budget: str = "Moderate"
    stay_type: str = "Hotel"
    neighborhood: str = ""
    preferences: list[str] = Field(default_factory=list)


class HotelOption(BaseModel):
    id: str
    name: str
    area: str
    rating: float
    review_count: int
    price_per_night_usd: int
    total_estimate_usd: int
    highlights: list[str] = Field(default_factory=list)
    booking_url: str
    source: str = "mock-hotel-provider"


class HotelSearchResponse(BaseModel):
    mode: Literal["mock", "provider"] = "mock"
    provider: str
    summary: str
    options: list[HotelOption]
    next_step: str


class MemorySearchRequest(BaseModel):
    query: str = ""
    destination_pack_id: str = "japan"
    scopes: list[Literal["profile", "destination", "itinerary", "place"]] = Field(
        default_factory=lambda: ["profile", "destination", "itinerary", "place"],
    )
    limit: int = Field(default=6, ge=1, le=20)


class MemorySearchResult(BaseModel):
    id: str
    scope: Literal["profile", "destination", "itinerary", "place"]
    title: str
    snippet: str
    source: str
    score: float


class MemorySearchResponse(BaseModel):
    mode: Literal["lexical-mock", "vector"] = "lexical-mock"
    results: list[MemorySearchResult]
    next_search_layer: str = "MongoDB Atlas Vector Search"


class ProviderLimit(BaseModel):
    provider: str
    domain: Literal["maps", "flights", "hotels", "restaurants"]
    launch_role: str
    realistic_limit: str
    integration_note: str


class ProviderLimitResponse(BaseModel):
    provider_limits: list[ProviderLimit]
