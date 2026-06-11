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
    FlightSearchRequest,
    FlightSearchResponse,
    HotelSearchRequest,
    HotelSearchResponse,
    Itinerary,
    MemorySearchRequest,
    MemorySearchResponse,
    PlanTripRequest,
    PlanTripResponse,
    PlacesResponse,
    PlaceCategory,
    ProviderLimitResponse,
    SavedTrip,
    SaveTripResponse,
    TripListResponse,
    UserProfile,
)
from app.agent.planner import planner
from app.integrations.flights import search_flight_options
from app.integrations.hotels import search_hotel_options
from app.storage.repository import repository
from app.integrations.mcp_bridge import mcp_bridge

settings = get_settings()

app = FastAPI(
    title="Reiko API",
    version="0.1.0",
    description="Reiko — Your Personal Travel Curator. Planning, profiles, saved trips, Vertex AI Gemini, MongoDB Atlas, and MongoDB MCP.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _start_mcp_bridge() -> None:
    if settings.enable_mongodb_mcp and settings.mongodb_uri:
        ok = mcp_bridge.start(str(settings.mongodb_uri), settings.mongodb_database)
        if ok:
            import logging
            logging.getLogger(__name__).info("MCP bridge started — %d tools available", len(mcp_bridge.available_tools))


@app.on_event("shutdown")
def _stop_mcp_bridge() -> None:
    mcp_bridge.stop()


@app.get("/health")
def health() -> dict[str, object]:
    mongodb_status = {
        "configured": bool(settings.mongodb_uri),
        "available": repository.mongodb_available,
        "mode": repository.persistence_mode,
        "database": settings.mongodb_database,
        "collections": {
            "trips": settings.mongodb_trips_collection,
            "profiles": settings.mongodb_profiles_collection,
            "destination_packs": settings.mongodb_destination_packs_collection,
        },
        "last_error": repository.mongodb_error or None,
        "vector_search_available": repository.mongodb_available and bool(settings.google_cloud_project),
    }

    planner_mode = (
        "gemini-function-calling"
        if settings.enable_live_gemini and bool(settings.google_cloud_project)
        else "mock"
    )

    return {
        "status": "ok",
        "env": settings.app_env,
        "planner": planner_mode,
        "persistence": repository.persistence_mode,
        "google_cloud_project_configured": bool(settings.google_cloud_project),
        "google_api_key_configured": bool(settings.google_api_key),
        "mongodb_configured": mongodb_status["configured"],
        "mongodb_available": mongodb_status["available"],
        "mongodb_database": mongodb_status["database"],
        "mongodb": mongodb_status,
        "mongodb_mcp_configured": bool(settings.mongodb_mcp_server_url),
        "gemini_model": settings.gemini_model,
        "live_gemini_enabled": settings.enable_live_gemini,
        "live_maps_enabled": settings.enable_live_maps,
        "live_flights_enabled": settings.enable_live_flights,
        "serpapi_configured": bool(settings.serpapi_api_key),
    }


@app.post("/api/agent/plan", response_model=PlanTripResponse)
def plan_trip(request: PlanTripRequest) -> PlanTripResponse:
    return planner.plan(request)


@app.post("/api/agent/chat", response_model=AgentChatResponse)
def chat_with_agent(request: AgentChatRequest) -> AgentChatResponse:
    return planner.chat(request)


@app.post("/api/booking/flights/search", response_model=FlightSearchResponse)
def search_booking_flights(request: FlightSearchRequest) -> FlightSearchResponse:
    return search_flight_options(request)


@app.post("/api/booking/hotels/search", response_model=HotelSearchResponse)
def search_booking_hotels(request: HotelSearchRequest) -> HotelSearchResponse:
    return search_hotel_options(request)


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


@app.get("/api/trips/{trip_id}", response_model=SavedTrip)
def get_trip(trip_id: str) -> SavedTrip:
    saved_trip = repository.get_saved_trip(trip_id)
    if saved_trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return saved_trip


@app.post("/api/trips", response_model=SaveTripResponse, status_code=201)
def save_trip(payload: SavedTrip | Itinerary) -> SaveTripResponse:
    saved_trip = payload if isinstance(payload, SavedTrip) else SavedTrip(itinerary=payload)
    saved_trip = repository.save_saved_trip(saved_trip)
    return SaveTripResponse(
        saved=True,
        trip=saved_trip.itinerary,
        place_details=saved_trip.place_details,
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
    vector_results = repository.vector_search_memory(request.query, limit=request.limit)
    if vector_results:
        return MemorySearchResponse(mode="vector", results=vector_results)
    return MemorySearchResponse(mode="lexical-mock", results=repository.search_memory(request))


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
