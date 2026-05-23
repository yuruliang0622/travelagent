from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import (
    AgentChatRequest,
    AgentChatResponse,
    BookingChecklistPatch,
    BookingChecklistResponse,
    DestinationPack,
    DestinationPackListResponse,
    Itinerary,
    MemorySearchRequest,
    MemorySearchResponse,
    PlanTripRequest,
    PlanTripResponse,
    PlacesResponse,
    PlaceCategory,
    ProviderLimitResponse,
    SaveTripResponse,
    TripListResponse,
    UserProfile,
)
from app.services.planner import planner
from app.services.repository import repository

settings = get_settings()

app = FastAPI(
    title="Trip Agent API",
    version="0.1.0",
    description="Backend foundation for Trip Agent: planning, profiles, saved trips, Vertex AI Gemini, MongoDB Atlas, and MongoDB MCP.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "env": settings.app_env,
        "planner": "mock",
        "persistence": repository.persistence_mode,
        "google_cloud_project_configured": bool(settings.google_cloud_project),
        "google_api_key_configured": bool(settings.google_api_key),
        "mongodb_configured": bool(settings.mongodb_uri),
        "mongodb_available": repository.mongodb_available,
        "mongodb_database": settings.mongodb_database,
        "mongodb_mcp_configured": bool(settings.mongodb_mcp_server_url),
        "gemini_model": settings.gemini_model,
        "live_gemini_enabled": settings.enable_live_gemini,
        "live_maps_enabled": settings.enable_live_maps,
    }


@app.post("/api/agent/plan", response_model=PlanTripResponse)
def plan_trip(request: PlanTripRequest) -> PlanTripResponse:
    return planner.plan(request)


@app.post("/api/agent/chat", response_model=AgentChatResponse)
def chat_with_agent(request: AgentChatRequest) -> AgentChatResponse:
    return planner.chat(request)


@app.get("/api/trips", response_model=TripListResponse)
def list_trips() -> TripListResponse:
    return TripListResponse(
        mode=repository.persistence_mode,
        trips=repository.list_trips(),
    )


@app.get("/api/destination-packs", response_model=DestinationPackListResponse)
def list_destination_packs() -> DestinationPackListResponse:
    return DestinationPackListResponse(destination_packs=repository.list_destination_packs())


@app.get("/api/destination-packs/{pack_id}", response_model=DestinationPack)
def get_destination_pack(pack_id: str) -> DestinationPack:
    pack = repository.get_destination_pack(pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail="Destination pack not found")
    return pack


@app.get("/api/trips/{trip_id}", response_model=Itinerary)
def get_trip(trip_id: str) -> Itinerary:
    trip = repository.get_trip(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.post("/api/trips", response_model=SaveTripResponse, status_code=201)
def save_trip(trip: Itinerary) -> SaveTripResponse:
    saved_trip = repository.save_trip(trip)
    return SaveTripResponse(
        saved=True,
        trip=saved_trip,
        persistence=repository.persistence_mode,
    )


@app.post("/api/profiles", response_model=UserProfile, status_code=201)
def save_profile(profile: UserProfile) -> UserProfile:
    return repository.save_profile(profile)


@app.get("/api/profiles/{profile_id}", response_model=UserProfile)
def get_profile(profile_id: str) -> UserProfile:
    profile = repository.get_profile(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.get("/api/places", response_model=PlacesResponse)
def list_places(
    trip_id: str | None = None,
    q: str = "",
    category: PlaceCategory | None = None,
) -> PlacesResponse:
    return PlacesResponse(places=repository.list_places(trip_id, q, category))


@app.get("/api/booking-checklist/{trip_id}", response_model=BookingChecklistResponse)
def get_booking_checklist(trip_id: str) -> BookingChecklistResponse:
    booking_checklist = repository.get_booking_checklist(trip_id)
    if booking_checklist is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return BookingChecklistResponse(booking_checklist=booking_checklist)


@app.patch(
    "/api/booking-checklist/{trip_id}/{item_id}",
    response_model=BookingChecklistResponse,
)
def update_booking_checklist_item(
    trip_id: str,
    item_id: str,
    patch: BookingChecklistPatch,
) -> BookingChecklistResponse:
    item = repository.update_booking_checklist_item(trip_id, item_id, patch)
    if item is None:
        raise HTTPException(status_code=404, detail="Trip or checklist item not found")

    booking_checklist = repository.get_booking_checklist(trip_id) or []
    return BookingChecklistResponse(booking_checklist=booking_checklist)


@app.post("/api/memory/search", response_model=MemorySearchResponse)
def search_memory(request: MemorySearchRequest) -> MemorySearchResponse:
    return MemorySearchResponse(results=repository.search_memory(request))


@app.get("/api/provider-limits", response_model=ProviderLimitResponse)
def list_provider_limits() -> ProviderLimitResponse:
    return ProviderLimitResponse(provider_limits=repository.list_provider_limits())


@app.get("/api/tools")
def list_tools() -> dict[str, object]:
    return {
        "style": "MongoDB MCP partner-track tools plus app-level travel tools",
        "host": "Google Cloud Agent Builder / Cloud Run integration",
        "tools": [
            {"name": "mongodb.find", "purpose": "Fetch profiles, trips, destination packs, and tool run history."},
            {"name": "mongodb.insert/update", "purpose": "Persist approved itineraries, preferences, and chat sessions."},
            {"name": "mongodb.aggregate", "purpose": "Run itinerary analytics and structured trip queries."},
            {"name": "mongodb.vectorSearch", "purpose": "Retrieve semantically relevant Japan travel content and saved memories."},
            {"name": "places.search", "purpose": "Find candidate places with Google Maps Platform."},
            {"name": "routes.estimate", "purpose": "Estimate travel time and avoid impossible days."},
        ],
    }
