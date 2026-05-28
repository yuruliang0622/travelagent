import json

from app.config import get_settings
from app.data.mock_data import JAPAN_PACK, itinerary_for_profile
from app.models import (
    AgentChatRequest,
    AgentChatResponse,
    DestinationPack,
    Itinerary,
    PlanTripRequest,
    PlanTripResponse,
)
from app.agent.gemini import generate_text, run_agent_loop
from app.agent.parser import itinerary_from_gemini, normalize_chat_answer, strip_fences
from app.agent.prompts import (
    _past_trips_section,
    build_chat_system_prompt,
    build_plan_system_prompt,
    build_plan_user_message,
)
from app.agent.request_helpers import day_allocation_from_prompt, destination_for_request, destination_pack_for_request, prompt_for_request, slug
from app.agent.tools import CHAT_TOOLS, dispatch_chat_tool
from app.enrichment.attractions import prefetch_attractions, replace_unknown_attractions
from app.enrichment.restaurants import apply_real_restaurants, apply_validated_coords, prefetch_restaurants, restaurant_identity
from app.integrations.maps import batch_get_place_details


class TripPlanner:
    """Planner using Gemini function calling on Vertex AI.

    Falls back to mock data when live mode is disabled or credentials are unavailable.
    """

    def plan(self, request: PlanTripRequest) -> PlanTripResponse:
        from app.storage.repository import repository

        profile = request.profile
        fallback_itinerary = itinerary_for_profile(profile)
        destination_pack = destination_pack_for_request(request)
        settings = get_settings()

        if settings.enable_live_gemini and settings.google_cloud_project:
            result = self._try_agent_plan(request, fallback_itinerary, destination_pack, repository)
            if result is not None:
                itinerary, tool_trace, place_details = result
                # Persist to MongoDB Atlas and add to trace
                try:
                    repository.save_trip(itinerary)
                    tool_trace.append("save_trip (MongoDB Atlas)")
                except Exception:
                    pass
                return PlanTripResponse(
                    mode="gemini-function-calling",
                    prompt=prompt_for_request(request),
                    destination_pack=destination_pack,
                    itinerary=itinerary,
                    memory_used=bool(profile and profile.memory_consent),
                    next_integrations=[
                        f"Tools used: {', '.join(tool_trace)}" if tool_trace else "Agent tools active",
                    ],
                    tool_trace=tool_trace,
                    place_details=place_details,
                )

        return PlanTripResponse(
            mode="mock",
            prompt=prompt_for_request(request),
            destination_pack=JAPAN_PACK,
            itinerary=fallback_itinerary,
            memory_used=bool(profile and profile.memory_consent),
            next_integrations=[
                "Vertex AI Gemini structured itinerary generation",
                "MongoDB Atlas user memory, destination packs, and saved trips",
                "MongoDB Atlas Vector Search retrieval",
                "MongoDB MCP server partner-track integration",
                "Google Maps Places and Routes enrichment",
            ],
        )

    def chat(self, request: AgentChatRequest) -> AgentChatResponse:
        from app.storage.repository import repository

        settings = get_settings()
        fallback = (
            "I can help with that from the current itinerary. For the strongest demo, "
            "ask me about a specific day, food stop, train transfer, or cultural note."
        )

        if not settings.enable_live_gemini or not settings.google_cloud_project:
            return AgentChatResponse(mode="mock", answer=fallback)

        # Inject past trip memory so Reiko knows the traveler's history
        past_trips = repository._memory_search_trips()
        past_trips_summary = _past_trips_section(past_trips)
        system_prompt = build_chat_system_prompt(request, past_trips_summary)
        user_message = request.question

        text, tool_trace = run_agent_loop(
            system_prompt=system_prompt,
            user_message=user_message,
            tools=CHAT_TOOLS,
            tool_dispatcher=lambda name, args: dispatch_chat_tool(name, args, repository),
        )

        answer = normalize_chat_answer(text) or fallback
        return AgentChatResponse(
            mode="gemini" if text else "mock",
            answer=answer,
            tool_trace=tool_trace,
        )

    # ── Agent plan orchestration ───────────────────────────────────────────────

    def _try_agent_plan(
        self,
        request: PlanTripRequest,
        base_itinerary: Itinerary,
        destination_pack: DestinationPack,
        repository,
    ) -> tuple[Itinerary, list[str], dict[str, dict]] | None:
        destination = destination_for_request(request)
        tool_trace: list[str] = []

        past_trips = repository._memory_search_trips()
        past_trips_summary = _past_trips_section(past_trips)

        system_prompt = build_plan_system_prompt()

        # Pre-fetch real attractions so Gemini has concrete names instead of "Explore Tokyo"
        attractions = prefetch_attractions(request, destination, destination_pack)
        if attractions:
            tool_trace.append("prefetch_attractions (Google Maps)")

        day_allocation = request.day_allocation or day_allocation_from_prompt(request.prompt, request.days)

        user_message = build_plan_user_message(
            request, base_itinerary, [], attractions, "", past_trips_summary, day_allocation
        )

        text = generate_text(
            system_prompt=system_prompt,
            user_message=user_message,
            temperature=0.45,
        )

        if not text:
            return None

        try:
            generated = json.loads(strip_fences(text))
        except json.JSONDecodeError:
            return None

        itinerary = itinerary_from_gemini(request, base_itinerary, destination_pack, generated)
        if itinerary is None:
            return None

        # ── Phase 2: Fetch and inject restaurants based on confirmed route ─────
        restaurants = prefetch_restaurants(request, destination, destination_pack) if _wants_food_enrichment(request) else []
        if restaurants:
            tool_trace.append("find_restaurants (Google Maps)")

        itinerary = apply_validated_coords(itinerary, restaurants)
        if restaurants:
            itinerary = apply_real_restaurants(itinerary, restaurants, slug, [])

        # ── Phase 2.5: Replace hallucinated attraction names with real ones ──
        if attractions:
            itinerary = replace_unknown_attractions(itinerary, attractions, slug)
            tool_trace.append("replace_unknown_attractions")

        # ── Phase 3: Resolve full place details for winning segments ─────
        place_details = _resolve_place_details(itinerary, attractions, restaurants)
        if place_details:
            tool_trace.append("batch_get_place_details (Google Maps)")

        return itinerary, tool_trace, place_details

planner = TripPlanner()


def _wants_food_enrichment(request: PlanTripRequest) -> bool:
    profile = request.profile
    values = [request.prompt]
    if profile:
        values.extend(profile.food_preferences or [])
        values.extend(profile.interests or [])
    text = " ".join(str(value).lower() for value in values if value)
    return any(token in text for token in ("food", "restaurant", "ramen", "sushi", "street food", "local cuisine", "dining", "vegetarian", "vegan", "halal"))


# ── Stage 3: Place Details Resolution ──────────────────────────────────────────

def _resolve_place_details(
    itinerary: Itinerary,
    prefetched_attractions: list[dict],
    prefetched_restaurants: list[dict],
) -> dict[str, dict]:
    """Match winning segments back to prefetched data to get real place_ids,
    then batch-resolve full details (phone, hours, website, photos)."""
    import re

    def _norm(value: str) -> str:
        base = (value or "").lower()
        base = re.sub(r"[^a-z0-9]+", " ", base)
        return re.sub(r"\s+", " ", base).strip()

    # Build lookup: normalized_name → real Google Maps place_id
    name_to_pid: dict[str, str] = {}
    for a in prefetched_attractions:
        if a.get("place_id"):
            name_to_pid[_norm(a["name"])] = a["place_id"]
    for r in prefetched_restaurants:
        if r.get("place_id"):
            name_to_pid[restaurant_identity(r["name"])] = r["place_id"]

    # Match segments → real place_ids
    real_pids: dict[str, str] = {}  # slug_key → real place_id
    for day in itinerary.days:
        for seg in day.segments:
            seg_norm = _norm(seg.title)
            pid = name_to_pid.get(seg_norm)
            if pid:
                key = seg.place_ids[0] if seg.place_ids else seg_norm
                real_pids[key] = pid

    if not real_pids:
        return {}

    # Batch resolve with real place_ids
    raw = batch_get_place_details(list(real_pids.values()))

    # Re-key by slug for frontend lookup
    result: dict[str, dict] = {}
    for slug_key, pid in real_pids.items():
        if pid in raw:
            result[slug_key] = raw[pid]
    return result
