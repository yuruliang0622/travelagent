import json
import re

from app.models import AgentChatRequest, Itinerary, PlanTripRequest
from app.agent.request_helpers import dates_for_request, days_from_prompt, destination_for_request, prompt_for_request
from app.agent.route_skeleton import route_skeleton_for_request


def build_plan_system_prompt() -> str:
    return (
        "You are Trip Agent — a team of specialist travel planners:\n"
        "  • Flight Agent: anchors arrival/departure constraints\n"
        "  • Experience Curator: selects landmarks, culture, neighborhoods, and day trips\n"
        "  • Food Specialist: adds local food highlights\n\n"
        "Think step by step: first decide the route backbone and day-by-day city allocation, then write the full itinerary.\n\n"
        "ROUTE RULES (critical):\n"
        "- The DAY ALLOCATION in the user message is FIXED — do not change which city each day is assigned to.\n"
        "- Respect selected flights when provided. Do not invent same-airport round trips, gateway nights, airport names, or flight times.\n"
        "- Agent chooses the best intercity transport by default; do not ask the traveler to choose trains vs flights unless genuinely ambiguous.\n"
        "- Day 1 = the day the traveler ARRIVES at the destination (arrive_time date), NOT the day they depart from their home airport. For transpacific flights crossing the date line, the arrival date is typically one calendar day after the departure date — use arrive_time to anchor Day 1.\n"
        "- Last day must respect flight departure: plan only what is achievable before depart_time.\n"
        "- Include iconic landmarks and local specialties before niche museums.\n\n"
        "PREFERENCE MATCHING RULES (critical):\n"
        "- Treat explicit traveler interests as required route ingredients, not optional flavor.\n"
        "- If the user mentions onsen, hot springs, ryokan, wellness, or relaxing baths, include a real onsen/ryokan experience that fits the chosen route.\n"
        "- If the user asks for nature, include at least one park, mountain, lake, garden, coast, or scenic viewpoint.\n"
        "- If the user asks for history/culture, include landmark temples, shrines, castles, museums, or preserved districts.\n"
        "- Never use hotels, ryokan names, or accommodation brands as sightseeing stops unless the segment is explicitly check-in, luggage drop, or overnight stay.\n\n"
        "PLANNING STEPS:\n"
        "- Do NOT call flight, hotel, or place validation tools during itinerary generation; booking and coordinate checks happen after planning.\n"
        "- Output the final itinerary JSON using the schema in the user message.\n\n"
        "SEASONALITY PLANNING RULES:\n"
        "- Read TRAVEL SEASON carefully — it is a hard constraint, not a hint.\n"
        "- Choose activities, parks, and landmarks that are at their best during the travel season:\n"
        "    Spring → cherry blossoms (hanami), tulip fields, outdoor festivals, mild-weather hikes\n"
        "    Summer → beach days, rooftop bars, night markets, outdoor concerts, early morning starts to beat heat\n"
        "    Autumn → fall foliage (koyo) routes, harvest festivals, wine regions, golden-hour photography spots\n"
        "    Winter → illumination events, ski areas, Christmas markets, cosy indoor culture, winter festivals\n"
        "      (hot springs/onsen only if the traveler explicitly selected them in INTERESTS — check PREFERENCE CONTRACT)\n"
        "- Prefer seasonal cuisine in meal stops: spring asparagus, summer seafood, autumn mushrooms, winter hot pot.\n"
        "- Mention the seasonal angle in each segment description so the traveler understands WHY this stop fits the season.\n"
        "- Flag weather risks or seasonal closures in the assumptions field.\n\n"
        "RESTAURANT RULES (secondary):\n"
        "- If the user message contains an APPROVED RESTAURANTS section, meal segment titles MUST use exact names from that list.\n"
        "- NEVER write generic titles like 'Dinner in Ueno', 'Lunch Break', 'Casual Cafe', 'Authentic Japanese Flavors'.\n"
        "- If restaurant details are provided, meal descriptions should include the rating and review_highlight.\n"
        "  Format: 'One sentence why it fits. ⭐ [rating] — \"[review_highlight snippet]\"'\n"
        "- Add each used restaurant to the places list with category='restaurant'.\n\n"
        "FOOD PLANNING RULES:\n"
        "- Include AT MOST 2 named meal stops per day from the APPROVED RESTAURANTS list (typically lunch + dinner).\n"
        "- Vegetarian/vegan/halal/allergy constraints are HARD requirements — never violate.\n"
        "- Vary restaurants across days — don't repeat the same place twice.\n\n"
        "SCHEDULE STRUCTURE (mandatory — produce a balanced day, not a food crawl):\n"
        "- Each day MUST have at least 3 non-food segments (attractions, culture, parks, neighborhood walks, shopping, viewpoints).\n"
        "- Each day has AT MOST 1-2 meal segments: one lunch (between 12:00 and 13:30) and one dinner (between 18:30 and 20:30).\n"
        "  Optionally one breakfast (07:30–09:30) if it's an iconic spot (e.g. Tsukiji breakfast).\n"
        "- Leave at least 2 hours between any two meal segments. Never schedule a 16:00 restaurant followed by an 18:00 restaurant.\n"
        "- The 14:00-17:00 block is for attractions / culture / walks — NOT meals.\n"
        "- NEVER use generic attraction titles like 'Explore Shinjuku', 'Wander around the area', 'Neighborhood walk', 'Free time'.\n"
        "  If you need a flexible time block, name a SPECIFIC street, district, or landmark (e.g. 'Takeshita Street stroll', 'Omotesando shopping walk').\n\n"
        "PACKING REMINDERS:\n"
        "- Output ONLY the 'Wear' category in reminders. Docs, Cash, and Kit are handled by the system.\n"
        "- Wear items based on: travel season (hot/cold/rain), planned activities (hiking/swimming/skiing), and destination culture (temple dress codes).\n"
        "- Activity gear (snorkel, hiking poles, ski jacket) also goes into a second 'Kit' reminder group ONLY when the activity requires it.\n"
        "- Style: short bullet points, no emoji, no markdown. 3-5 items per category max.\n\n"
        "CRITICAL RULES:\n"
        "- ALWAYS plan for the EXACT destination the traveler requests. Never substitute.\n"
        "- Final response MUST be a single raw JSON object. No markdown, no code fences.\n"
        "- Start with '{' and end with '}'. Follow the exact schema in the user message."
    )


def build_plan_user_message(
    request: PlanTripRequest,
    base_itinerary: Itinerary,
    restaurants: list[dict] | None = None,
    attractions: list[dict] | None = None,
    route_brief: str = "",
    past_trips_summary: str = "",
    day_allocation: str = "",
) -> str:
    profile = request.profile or base_itinerary.profile
    destination = destination_for_request(request)
    days = request.days or days_from_prompt(request.prompt) or 5
    dates = dates_for_request(request, days)
    food_section = _food_preferences_section(profile.food_preferences or [], profile.constraints or [])
    season_section = _season_section(profile.travel_month.strip() if profile.travel_month else "", request.prompt)
    route_section = route_skeleton_for_request(request)
    restaurant_section = _restaurant_section(restaurants or [])
    attraction_section = _attraction_section(attractions or [])
    preference_contract = _preference_contract_section(profile.interests or [])

    return f"""
TRAVELER REQUEST:
{prompt_for_request(request)}

{past_trips_summary}
DAY ALLOCATION (FIXED — do not change which city each day is assigned to):
{day_allocation or 'D1: ' + destination + ', etc. (no day allocation provided — keep all days in the destination area)'}

DESTINATION: {destination}
TRIP LENGTH: {days} days. {dates}
PACE: {profile.pace} | BUDGET: {profile.budget} | TRAVELERS: {profile.travelers}
SELECTED FLIGHT: {_selected_flight_line(profile.selected_flight)}
INTERESTS: {', '.join(profile.interests) if profile.interests else 'general sightseeing'}{preference_contract}{route_section}{season_section}{food_section}{attraction_section}{restaurant_section}
FULL PROFILE:
{json.dumps(profile.model_dump(), ensure_ascii=False)}

After calling the required tools, return ONLY JSON with this exact shape:
{{
  "title": "short itinerary title",
  "subtitle": "one sentence summary",
  "places": [
    {{"id":"short-id","name":"place name","category":"restaurant|attraction|shopping|transit|culture|wellness|hotel|airport","neighborhood":"area","lat":0,"lng":0,"cost":"$","duration":"~2 hr","why_it_fits":"why this fits the traveler","google_maps_query":"place plus destination"}}
  ],
  "days": [
    {{"day_number":1,"date":"Day 1 or date","title":"day title","area":"city name only — e.g. Tokyo, Kyoto, Hakone (not a neighborhood or district)","color":"#2563eb","segments":[{{"time":"10:00","title":"stop or activity","description":"short benefit or cultural context","place_id":"short-id","travel_note":"movement note","cost":"$"}}]}}
  ],
  "daily_balance_rule": "Each day should mix sightseeing/culture/neighborhoods with at most 2 restaurant segments.",
  "summary": {{
    "hotel": "Write this AFTER filling in all days above. List only the cities/areas that actually appear in the days above — do not invent cities. Format: Area name: reason · Area name: reason · Area name: reason  (3 short bullets, ·-separated, ≤8 words each)",
    "flights": "Airport code: note · Airport code: note · tip  (3 short bullets, ·-separated, ≤8 words each)",
    "transit": "Mode: tip · Mode: tip · tip  (3 short bullets, ·-separated, ≤8 words each)",
    "budget": "Currency note · Daily estimate · biggest cost tip  (3 short bullets, ·-separated, ≤8 words each)"
  }},
  "reminders": [{{"title":"Wear","items":["season-appropriate clothing","activity-specific gear"]}}],
  "booking_checklist": [{{"id":"short-id","type":"flight|hotel|restaurant|ticket|calendar","title":"booking task","provider":"provider name","status":"needs-review|optional|later|ready","deadline":"when to decide","action_label":"button label","handoff_url":"https://www.google.com/search?q=..."}}],
  "assumptions": ["3 short assumptions or caveats"]
}}
""".strip()


def build_chat_system_prompt(request: AgentChatRequest, past_trips_summary: str = "") -> str:
    conversation = "\n".join(
        f"{message.role}: {message.content}"
        for message in request.messages[-8:]
    )
    return (
        "You are Reiko, a friendly senior travel agent inside Trip Agent.\n"
        "Answer the traveler concisely: 2-4 sentences, practical, warm, and specific.\n"
        "Do not invent confirmed bookings. If the user asks about their preferences or past trips, "
        "use search_trip_memory to look up their saved info from MongoDB Atlas.\n\n"
        f"{past_trips_summary}"
        "BOOKING TOOL RULES:\n"
        "- First scan ITINERARY CONTEXT for Home airport, Departure date, Return date, and Selected flight. Reuse those details; do not ask for them again unless they are absent.\n"
        "- If the traveler approves a plan or asks for flights/hotels, call search_flights AND search_hotels only for details that are not already selected in context.\n"
        "- After getting results, present 2-3 specific options for flights and 2-3 for hotels.\n"
        "- Keep booking replies short. Prefer selectable options in the frontend; if you include provider URLs, include at most one review link per option and avoid long repeated link lists.\n"
        "- Always mention the budget tier and which area/neighborhood the hotels are in.\n"
        "- End with one actionable tip (e.g. 'Book flights 6-8 weeks out for best fares').\n\n"
        "PLAN MODIFICATION:\n"
        "- If the traveler asks to change the itinerary (add/remove cities, adjust which city is on which day, "
        "change activities, adjust pace), call regenerate_plan with a clear summary of the requested changes.\n"
        "- After calling regenerate_plan, the backend will rebuild the itinerary. Acknowledge the changes briefly.\n\n"
        f"ITINERARY CONTEXT:\n{request.trip_context}\n\n"
        f"RECENT CONVERSATION:\n{conversation}"
    )


def _preference_contract_section(interests: list[str]) -> str:
    """Generate a preference contract that tells the LLM what to include and exclude.

    The contract uses 'plan before act' — by asking the LLM to explicitly commit
    to inclusions/exclusions before writing, it self-constrains rather than
    relying on post-processing rules.
    """
    if not interests:
        return ""

    interest_text = " ".join(interests).lower()

    # Map known interest keywords to concrete experiences
    _INTEREST_TO_EXPERIENCE: dict[str, str] = {
        "history": "temples, shrines, castles, preserved historic districts",
        "culture": "traditional arts, local neighborhoods, cultural museums, craft quarters",
        "nature": "parks, mountains, lakes, gardens, scenic viewpoints",
        "food": "local markets, food halls, specialty restaurants, culinary streets",
        "art": "art museums, galleries, contemporary art spaces, design districts",
        "shopping": "department stores, local markets, specialty shops, craft stores",
        "nightlife": "bars, izakayas, night markets, evening entertainment districts",
        "onsen": "onsen (hot-spring) bath experience — ryokan or public bathhouse",
        "wellness": "onsen, spa, zen gardens, mindfulness spaces",
        "adventure": "hiking trails, cycling routes, outdoor day trips to mountains",
        "anime": "Akihabara, anime/manga stores, themed cafés",
    }

    # Optional categories that should be EXCLUDED when not selected
    _OPTIONAL_EXCLUSIONS: list[tuple[list[str], str]] = [
        (["onsen", "wellness", "hot spring", "ryokan"],
         "onsen / hot springs / ryokan wellness stays"),
        (["adventure", "hiking", "cycling"],
         "strenuous hikes or adventure-sport activities"),
        (["anime", "manga", "akihabara"],
         "anime merchandise or themed pop-culture cafés"),
        (["nightlife", "club", "bar"],
         "nightclub or late-night bar crawls"),
    ]

    must_include: list[str] = []
    for interest in interests:
        il = interest.lower()
        matched = next((exp for kw, exp in _INTEREST_TO_EXPERIENCE.items() if kw in il), None)
        if matched:
            must_include.append(f"  - {interest} → {matched}")
        else:
            must_include.append(f"  - {interest} → include relevant authentic experiences")

    must_not: list[str] = []
    for trigger_keywords, label in _OPTIONAL_EXCLUSIONS:
        if not any(kw in interest_text for kw in trigger_keywords):
            must_not.append(f"  - {label} (user did not select this — omit entirely)")

    if not must_include and not must_not:
        return ""

    section = "\nPREFERENCE CONTRACT — commit to this before writing the itinerary:\n"
    if must_include:
        section += "✓ MUST include (user-selected interests):\n" + "\n".join(must_include) + "\n"
    if must_not:
        section += "✗ MUST NOT include (not selected by user — even if seasonally typical):\n"
        section += "\n".join(must_not) + "\n"
    return section


def _food_preferences_section(food_prefs: list[str], constraints: list[str]) -> str:
    dietary_kw = {"vegetarian", "vegan", "halal", "gluten", "seafood", "allerg", "kosher", "dairy"}
    cuisine_kw = {"cuisine", "street food", "fusion", "local", "traditional", "coastal", "surprise", "market"}
    dining_kw = {"quick bites", "quick bite", "casual", "fine dining", "sit-down", "mix of"}

    dietary_prefs = [p for p in food_prefs if any(k in p.lower() for k in dietary_kw)]
    cuisine_prefs = [p for p in food_prefs if p not in dietary_prefs and any(k in p.lower() for k in cuisine_kw)]
    dining_prefs = [p for p in food_prefs if p not in dietary_prefs and p not in cuisine_prefs and any(k in p.lower() for k in dining_kw)]
    other_prefs = [p for p in food_prefs if p not in dietary_prefs and p not in cuisine_prefs and p not in dining_prefs and "no restriction" not in p.lower()]

    if not food_prefs and not constraints:
        return ""

    section = "\nFOOD PREFERENCES:\n"
    if dietary_prefs:
        section += f"  Dietary restrictions (HARD — never violate): {', '.join(dietary_prefs)}\n"
    if cuisine_prefs:
        section += f"  Cuisine style wanted: {', '.join(cuisine_prefs)}\n"
    if dining_prefs:
        section += f"  Dining style wanted: {', '.join(dining_prefs)}\n"
    if other_prefs:
        section += f"  Other food notes: {', '.join(other_prefs)}\n"
    if constraints:
        section += f"  Additional constraints: {', '.join(constraints)}\n"
    return section


def _season_section(season_hint: str, prompt: str) -> str:
    if not season_hint:
        month_match = re.search(
            r"\b(January|February|March|April|May|June|July|August|September|October|November|December"
            r"|Spring|Summer|Fall|Autumn|Winter|spring|summer|fall|autumn|winter"
            r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b",
            prompt,
        )
        season_hint = month_match.group(0) if month_match else ""
    return f"\nTRAVEL SEASON (hard constraint — plan activities that fit this season):\n  {season_hint}\n" if season_hint else ""


def _restaurant_section(restaurants: list[dict]) -> str:
    if not restaurants:
        return (
            "\nMEAL SEGMENTS — restaurants not yet assigned:\n"
            "  - Do NOT write specific restaurant names. Restaurant data will be injected after route generation.\n"
            "  - For meal slots, use area-based placeholder titles only: e.g. 'Lunch in Asakusa', 'Dinner near Namba'.\n"
            "  - Set place_ids to an empty list [] for every meal segment.\n"
            "  - Focus on getting the route, cities, and attractions right — meals are a post-processing step.\n"
        )

    section = "\nAPPROVED RESTAURANTS (real Google Maps results — use ONLY these names for meal stop titles):\n"
    for r in restaurants:
        meta_parts = []
        if r.get("neighborhood"):
            meta_parts.append(r["neighborhood"])
        if r.get("tag"):
            meta_parts.append(r["tag"])
        rating_str = (
            f"{r['rating']} ⭐ ({r['user_ratings_total']} reviews)"
            if r.get("rating") and r.get("user_ratings_total")
            else (f"{r['rating']} ⭐" if r.get("rating") else "")
        )
        if rating_str:
            meta_parts.append(rating_str)
        price_str = r.get("price", "")
        if price_str:
            meta_parts.append(price_str)
        review = (r.get("review_highlight") or "")[:120]
        section += f"  • {r['name']}"
        if meta_parts:
            section += f"  |  {'  ·  '.join(meta_parts)}"
        if review:
            section += f'\n    "{review}"'
        section += "\n"
    section += "  Rule: each meal segment title = exact name above. No invented names.\n"
    return section


def _attraction_section(attractions: list[dict]) -> str:
    if not attractions:
        return ""

    section = "\nAPPROVED ATTRACTIONS (real Google Maps results — prefer these names for non-food segments):\n"
    for a in attractions:
        meta_parts = []
        if a.get("neighborhood"):
            meta_parts.append(a["neighborhood"])
        if a.get("tag"):
            meta_parts.append(a["tag"])
        if a.get("rating"):
            meta_parts.append(f"{a['rating']} ⭐")
        meta = "  |  ".join(meta_parts)
        section += f"  • {a['name']}"
        if meta:
            section += f"  |  {meta}"
        section += "\n"
        if a.get("description"):
            section += f"    {a['description'][:140]}\n"
    section += (
        "  HARD RULE: You MUST use names from this list for all non-food segments. "
        "NEVER write 'Explore X', 'Wander X', or 'Free time' — these will be rejected.\n"
    )
    return section


def _selected_flight_line(selected_flight: dict | None) -> str:
    if not selected_flight:
        return "none"
    keys = (
        "airline",
        "origin",
        "destination",
        "depart_time",
        "arrive_time",
        "duration",
        "stops",
        "cabin",
        "price_usd",
    )
    parts = [f"{key}={selected_flight.get(key)}" for key in keys if selected_flight.get(key) not in (None, "")]
    return "; ".join(parts) if parts else json.dumps(selected_flight, ensure_ascii=False)


def build_skeleton_prompt(destination: str, days: int, preferences: str = "", past_trips_summary: str = "") -> str:
    return (
        "You are a route planner. Output ONLY a JSON array of day-to-city assignments.\n"
        "ONLY output which city each day, do NOT write any attraction details.\n"
        f"Destination: {destination}\n"
        f"Days: {days}\n"
        + (f"Preferences: {preferences}\n" if preferences else "")
        + (f"\n{past_trips_summary}\n" if past_trips_summary else "")
        + "Output format (NO other text):\n"
        '[{"day": 1, "city": "Tokyo"}, {"day": 2, "city": "Hakone"}, ...]\n'
        "Rules:\n"
        "- Every day must have exactly one city.\n"
        "- Use the actual city name, not the country.\n"
        "- Cities should form a logical geographic route.\n"
        "- Output ONLY the JSON array, no markdown, no explanation."
    )


def build_day_system_prompt(city: str) -> str:
    return (
        f"You are a local guide for {city}. Only recommend attractions and restaurants within {city}.\n"
        "Do NOT recommend places in any other city.\n"
        "Use ONLY names from the APPROVED ATTRACTIONS list.\n"
        "NEVER write 'Explore X', 'Wander X', or 'Free time' — use real attraction names.\n"
        "ALL output text (titles, descriptions, segment names) MUST be in English.\n"
        "Output a single day itinerary as JSON with the schema provided in the user message."
    )


def build_day_user_message(
    day_number: int,
    city: str,
    city_attractions: list[dict],
    profile,
    day_date: str = "",
) -> str:
    import json as _json

    interests = ", ".join(profile.interests) if profile.interests else "general sightseeing"
    date_line = f"DATE: {day_date}" if day_date else f"DAY: {day_number}"

    attraction_section = ""
    if city_attractions:
        attraction_section = "\nAPPROVED ATTRACTIONS (use ONLY these names for non-food segments):\n"
        for a in city_attractions:
            meta_parts = []
            if a.get("neighborhood"):
                meta_parts.append(a["neighborhood"])
            if a.get("rating"):
                meta_parts.append(f"{a['rating']} ⭐")
            meta = "  |  ".join(meta_parts)
            attraction_section += f"  • {a['name']}"
            if meta:
                attraction_section += f"  |  {meta}"
            attraction_section += "\n"
        attraction_section += "HARD RULE: Use names from this list. No invented attraction names.\n"

    return f"""
CITY: {city}
{date_line}
PACE: {profile.pace} | BUDGET: {profile.budget} | TRAVELERS: {profile.travelers}
INTERESTS: {interests}
{attraction_section}
FOOD PREFERENCES: {", ".join(profile.food_preferences) if profile.food_preferences else "no restrictions"}

Output a single day JSON with this schema:
{{
  "title": "day title for Day {day_number} in {city}",
  "area": "{city}",
  "date": "Day {day_number}",
  "segments": [
    {{"time": "09:00", "title": "attraction name from approved list", "description": "short context", "place_id": "", "travel_note": "", "cost": "$"}}
  ],
  "places": [
    {{"id": "short-id", "name": "place name", "category": "attraction|restaurant", "neighborhood": "area", "lat": 0, "lng": 0, "cost": "$", "duration": "~1.5 hr", "why_it_fits": "why this fits", "google_maps_query": "place plus {city}"}}
  ]
}}
Schedule: at least 3 attraction segments, at most 2 meal segments (lunch 12:00-13:30, dinner 18:30-20:30).
Output ONLY raw JSON, no markdown, no code fences.
""".strip()


def _past_trips_section(trips: list) -> str:
    """Build a concise past-trip summary so the LLM can align with user history."""
    if not trips:
        return ""

    lines = ["YOUR PAST TRIPS (use these to understand your travel style and preferences):"]
    for trip in trips[:3]:
        profile = trip.profile
        interests = ", ".join(profile.interests) if profile.interests else "general sightseeing"
        food = ", ".join(profile.food_preferences) if profile.food_preferences else ""
        lines.append(
            f"  - {trip.title} ({trip.dates}) — {profile.pace.value} pace, {profile.budget} budget"
            f"{' — Food: ' + food if food else ''}"
            f"\n    Interests: {interests}"
        )
    return "\n".join(lines) + "\n"
