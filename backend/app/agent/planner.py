import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

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
from app.agent.parser import itinerary_from_gemini, normalize_chat_answer, parse_day_allocation_string, parse_skeleton, strip_fences
from app.agent.prompts import (
    _past_trips_section,
    build_chat_system_prompt,
    build_day_system_prompt,
    build_day_user_message,
    build_skeleton_prompt,
)
from app.agent.request_helpers import day_allocation_from_prompt, days_from_prompt, destination_for_request, destination_pack_for_request, prompt_for_request, slug
from app.agent.tools import CHAT_TOOLS, dispatch_chat_tool
from app.enrichment.attractions import prefetch_attractions, replace_unknown_attractions
from app.enrichment.quality import improve_itinerary_quality
from app.enrichment.restaurants import apply_real_restaurants, apply_validated_coords, prefetch_restaurants, restaurant_identity
from app.integrations.maps import batch_get_place_details
from app.integrations.mcp_bridge import mcp_bridge


class TripPlanner:
    """Planner using Gemini function calling on Vertex AI.

    Falls back to mock data when live mode is disabled or credentials are unavailable.
    """

    def plan(self, request: PlanTripRequest) -> PlanTripResponse:
        from app.storage.repository import repository

        self._last_plan_request = request

        profile = request.profile
        fallback_itinerary = itinerary_for_profile(profile)
        destination_pack = destination_pack_for_request(request)
        settings = get_settings()

        if settings.enable_live_gemini and settings.google_cloud_project:
            result = self._try_agent_plan(request, fallback_itinerary, destination_pack, repository)
            if result is not None:
                itinerary, tool_trace, place_details = result
                # Persist via MCP first, fall back to direct Atlas connection
                saved = False
                try:
                    if mcp_bridge.is_initialized:
                        mcp_bridge.upsert(
                            collection=settings.mongodb_trips_collection,
                            doc_id=itinerary.id,
                            document=itinerary.model_dump(),
                        )
                        tool_trace.append("save_trip (MongoDB MCP)")
                        saved = True
                except Exception:
                    pass
                if not saved:
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

        # Capture regenerate_plan calls so we can re-run the pipeline after the loop
        regen_requests: list[dict] = []

        def dispatcher(name: str, args: dict) -> dict:
            if name == "regenerate_plan":
                regen_requests.append(dict(args))
                return {"status": "captured", "changes": args.get("changes", "")}
            return dispatch_chat_tool(name, args, repository)

        text, tool_trace = run_agent_loop(
            system_prompt=system_prompt,
            user_message=user_message,
            tools=CHAT_TOOLS,
            tool_dispatcher=dispatcher,
        )

        # ── If the agent requested a plan regeneration, re-run the pipeline ──
        new_itinerary: Itinerary | None = None
        new_places: dict[str, dict] | None = None

        if regen_requests and getattr(self, "_last_plan_request", None) is not None:
            try:
                changes = regen_requests[-1].get("changes", "")
                orig = self._last_plan_request
                modified = PlanTripRequest(
                    prompt=orig.prompt + "\n\n[USER REQUESTED CHANGES]: " + changes,
                    destination=orig.destination,
                    days=orig.days,
                    start_date=orig.start_date,
                    end_date=orig.end_date,
                    destination_pack_id=orig.destination_pack_id,
                    profile=orig.profile,
                    day_allocation=orig.day_allocation,
                )
                fallback_itinerary = itinerary_for_profile(orig.profile)
                destination_pack = destination_pack_for_request(orig)
                result = self._try_agent_plan(modified, fallback_itinerary, destination_pack, repository)
                if result is not None:
                    new_itinerary, regen_trace, new_places = result
                    tool_trace.extend(regen_trace)
            except Exception:
                logger.exception("regenerate_plan pipeline failed")

        answer = normalize_chat_answer(text) or fallback
        return AgentChatResponse(
            mode="gemini" if text else "mock",
            answer=answer,
            tool_trace=tool_trace,
            itinerary=new_itinerary,
            place_details=new_places,
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
        profile = request.profile or base_itinerary.profile
        days_count = request.days or days_from_prompt(request.prompt) or 5
        tool_trace: list[str] = []

        # ── Phase 1: Prefetch attractions for all cities ──────────────────
        attractions = prefetch_attractions(request, destination, destination_pack)
        if attractions:
            tool_trace.append("prefetch_attractions (Google Maps)")

        # ── Phase 1.5: Search past trips via MCP for personalization ───
        past_trips_summary = ""
        try:
            settings = get_settings()
            if mcp_bridge.is_initialized:
                past_docs = mcp_bridge.find(
                    collection=settings.mongodb_trips_collection,
                    limit=3,
                )
                if past_docs:
                    past_trips_summary = _past_trips_section(past_docs)
                    tool_trace.append("search_past_trips (MongoDB MCP)")
        except Exception:
            pass

        # ── Phase 2: Generate skeleton (which city each day) ─────────────
        skeleton = _build_skeleton(request, destination, days_count, tool_trace, past_trips_summary)
        if not skeleton:
            return None

        # ── Phase 3: Per-day generation (parallel) ────────────────────────
        all_days: list[dict] = []
        all_places: list[dict] = []

        def _generate_day(day_info: dict) -> tuple[dict | None, list[dict], str]:
            day_num = day_info["day_number"]
            city = day_info["city"]
            city_atts = [a for a in attractions if (a.get("city") or "").lower() == city.lower()]

            day_system = build_day_system_prompt(city)
            day_user = build_day_user_message(day_num, city, city_atts, profile)

            day_text = generate_text(
                system_prompt=day_system,
                user_message=day_user,
                temperature=0.45,
            )

            if not day_text:
                return None, [], f"Day {day_num} ({city}): Gemini returned empty — skipping"

            try:
                day_json = json.loads(strip_fences(day_text))
            except json.JSONDecodeError:
                return None, [], f"Day {day_num} ({city}): invalid JSON — skipping"

            if not isinstance(day_json, dict):
                return None, [], f"Day {day_num} ({city}): unexpected JSON type — skipping"

            day_json["day_number"] = day_num
            places = day_json.pop("places", []) if isinstance(day_json.get("places"), list) else []
            trace = f"Day {day_num} ({city}): {len(day_json.get('segments', []))} segments"
            return day_json, places, trace

        with ThreadPoolExecutor(max_workers=min(len(skeleton), 6)) as executor:
            futures = {executor.submit(_generate_day, d): d for d in skeleton}
            for future in as_completed(futures):
                day_json, places, trace = future.result()
                if day_json is not None:
                    all_days.append(day_json)
                    all_places.extend(places)
                tool_trace.append(trace)

        all_days.sort(key=lambda d: d["day_number"])

        if not all_days:
            return None

        # ── Phase 4: Assemble into full itinerary ────────────────────────
        generated = {
            "title": f"{destination} {len(all_days)}-Day Tour",
            "subtitle": f"Personalized {len(all_days)}-day route for {destination}.",
            "places": all_places,
            "days": all_days,
        }

        itinerary = itinerary_from_gemini(request, base_itinerary, destination_pack, generated)
        if itinerary is None:
            return None

        # ── Phase 5: Restaurant enrichment ───────────────────────────────
        restaurants = prefetch_restaurants(request, destination, destination_pack) if _wants_food_enrichment(request) else []
        if restaurants:
            tool_trace.append("find_restaurants (Google Maps)")

        itinerary = apply_validated_coords(itinerary, restaurants)
        if restaurants:
            itinerary = apply_real_restaurants(itinerary, restaurants, slug, attractions)

        # ── Phase 5.5: Replace hallucinated attraction names ────────────
        if attractions:
            itinerary = replace_unknown_attractions(itinerary, attractions, slug)
            tool_trace.append("replace_unknown_attractions")

        # ── Phase 5.6: Quality review — dedup, weak stops, iconic inject ──
        itinerary = improve_itinerary_quality(itinerary, request)
        tool_trace.append("improve_itinerary_quality")

        # ── Phase 6: Resolve full place details ──────────────────────────
        place_details = _resolve_place_details(itinerary, attractions, restaurants)
        if place_details:
            tool_trace.append("batch_get_place_details (Google Maps)")

        return itinerary, tool_trace, place_details

def _build_skeleton(
    request: PlanTripRequest,
    destination: str,
    days_count: int,
    tool_trace: list[str],
    past_trips_summary: str = "",
) -> list[dict]:
    """Build day-to-city skeleton from user prompt or Gemini."""

    # Try parsing day allocation from user prompt first
    day_allocation = request.day_allocation or day_allocation_from_prompt(request.prompt, request.days)
    if day_allocation:
        skeleton = parse_day_allocation_string(day_allocation)
        if skeleton:
            tool_trace.append(f"skeleton (from prompt): {len(skeleton)} days")
            return skeleton

    # Fall back to Gemini skeleton generation
    skeleton_prompt = build_skeleton_prompt(destination, days_count, request.prompt, past_trips_summary)
    skeleton_text = generate_text(
        system_prompt="You are a route planner. Output only JSON. 只输出JSON。",
        user_message=skeleton_prompt,
        temperature=0.3,
    )
    if skeleton_text:
        skeleton = parse_skeleton(skeleton_text)
        if skeleton:
            tool_trace.append(f"skeleton (from Gemini): {len(skeleton)} days")
            return skeleton

    # Last resort: all days in main destination
    skeleton = [{"day_number": i + 1, "city": destination} for i in range(days_count)]
    tool_trace.append(f"skeleton (fallback): {len(skeleton)} days in {destination}")
    return skeleton


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

    # Match segments → real place_ids (exact first, then substring)
    real_pids: dict[str, str] = {}  # slug_key → real place_id
    for day in itinerary.days:
        for seg in day.segments:
            seg_norm = _norm(seg.title)
            pid = name_to_pid.get(seg_norm)
            if not pid:
                # Fuzzy: check if segment title contains a prefetched name or vice versa
                for name_norm, candidate_pid in name_to_pid.items():
                    if len(name_norm) > 4 and (name_norm in seg_norm or seg_norm in name_norm):
                        pid = candidate_pid
                        break
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
