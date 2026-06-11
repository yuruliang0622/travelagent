from google.genai import types

from app.models import FlightSearchRequest, HotelSearchRequest, MemorySearchRequest
from app.integrations.flights import search_flight_options
from app.integrations.hotels import search_hotel_options
from app.integrations.maps import validate_places as maps_validate_places


PLAN_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="search_destinations",
                description=(
                    "Search MongoDB Atlas for destination packs that match the traveler's region. "
                    "Returns cultural notes, transport tips, and regional info to ground the itinerary."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Semantic query (e.g. 'food culture temples Japan')",
                        },
                        "region": {
                            "type": "string",
                            "description": "Country or region name (e.g. 'Japan', 'Thailand')",
                        },
                    },
                    "required": ["query"],
                },
            ),
        ]
    )
]

CHAT_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="search_trip_memory",
                description=(
                    "Search the traveler's trips and profile using MongoDB Atlas Vector Search. "
                    "Use this when the user asks about their preferences, past trips, or saved info."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for in memory",
                        },
                    },
                    "required": ["query"],
                },
            ),
            types.FunctionDeclaration(
                name="search_flights",
                description=(
                    "Build flight search links when the user approves a plan or asks for flight options. "
                    "Returns booking links for Google Flights, Kayak, and Skyscanner."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "origin": {"type": "string", "description": "Departure city or airport"},
                        "destination": {"type": "string", "description": "Arrival city or airport"},
                        "travel_month": {"type": "string", "description": "Rough travel period"},
                    },
                    "required": ["origin", "destination"],
                },
            ),
            types.FunctionDeclaration(
                name="regenerate_plan",
                description=(
                    "Regenerate the trip itinerary when the traveler asks to modify the plan. "
                    "Use this when the traveler wants to: add/remove cities, change which city is on which day, "
                    "adjust activities, change pace or focus. "
                    "Extract a clear summary of what the traveler wants changed."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "changes": {
                            "type": "string",
                            "description": "Summary of changes the traveler requested (e.g. 'remove Nara, Day 6 should be Osaka', 'add more temples in Kyoto')",
                        },
                    },
                    "required": ["changes"],
                },
            ),
            types.FunctionDeclaration(
                name="search_hotels",
                description=(
                    "Find real hotels ONLY in the cities that appear in the itinerary. "
                    "Read the ITINERARY CONTEXT, extract the city names from each day's area field, "
                    "and pass them as the cities list. Do NOT pass country names like 'Japan' — "
                    "the country-level search will return hotels in irrelevant cities."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "destination": {"type": "string", "description": "Country or region (e.g. 'Japan')"},
                        "cities": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of specific cities from the itinerary to search hotels in (e.g. ['Tokyo', 'Kyoto', 'Osaka']). Required — do NOT skip this.",
                        },
                        "neighborhood": {"type": "string", "description": "Preferred neighborhood within the city"},
                        "budget": {"type": "string", "description": "Budget / Moderate / Comfortable / Luxury"},
                        "nights": {"type": "integer", "description": "Number of nights"},
                    },
                    "required": ["destination", "cities"],
                },
            ),
        ]
    )
]



def dispatch_plan_tool(name: str, args: dict, repository) -> dict:
    if name == "search_destinations":
        return search_destinations(args, repository)
    if name == "validate_places":
        return validate_places_tool(args)
    if name == "search_flights":
        return search_flights(args)
    if name == "search_hotels":
        return search_hotels(args)
    if name == "search_trip_memory":
        return search_memory(args, repository)
    return {"error": f"Unknown tool: {name}"}

def dispatch_chat_tool(name: str, args: dict, repository) -> dict:
    if name == "search_trip_memory":
        return search_memory(args, repository)
    if name == "search_flights":
        return search_flights(args)
    if name == "search_hotels":
        return search_hotels(args)
    if name == "regenerate_plan":
        return {"status": "captured", "changes": args.get("changes", "")}
    return {"error": f"Unknown tool: {name}"}

def search_destinations(args: dict, repository) -> dict:
    query = args.get("query", "")
    region = str(args.get("region", "")).lower()

    packs = repository.list_destination_packs()
    if region:
        filtered = [
            p for p in packs
            if region in p.country.lower() or any(region in r.lower() for r in p.regions)
        ]
        if filtered:
            packs = filtered

    return {
        "source": "mongodb-atlas",
        "query": query,
        "destination_packs": [
            {
                "id": p.id,
                "country": p.country,
                "regions": p.regions,
                "cultural_notes": p.cultural_notes,
                "transport_notes": p.transport_notes,
                "seasonal_notes": p.seasonal_notes,
            }
            for p in packs[:3]
        ],
    }

def validate_places_tool(args: dict) -> dict:
    place_names = [str(n) for n in args.get("place_names", []) if n]
    validated = maps_validate_places(place_names)
    return {"source": "google-maps-places", "validated_places": validated}

def search_flights(args: dict) -> dict:
    response = search_flight_options(
        FlightSearchRequest(
            origin=str(args.get("origin", "")).strip(),
            destination=str(args.get("destination", "")).strip(),
            departure_date=str(args.get("departure_date", "")).strip(),
            return_date=str(args.get("return_date", "")).strip(),
            travel_month=str(args.get("travel_month", "")).strip(),
            cabin=str(args.get("cabin", args.get("seat_class", "Economy"))).strip() or "Economy",
            flexibility=str(args.get("flexibility", "")).strip(),
        )
    )
    return response.model_dump()

def search_hotels(args: dict) -> dict:
    cities_raw = args.get("cities") or []
    if isinstance(cities_raw, str):
        cities = [c.strip() for c in cities_raw.split(",") if c.strip()]
    else:
        cities = [str(c).strip() for c in cities_raw if c]

    response = search_hotel_options(
        HotelSearchRequest(
            destination=str(args.get("destination", "")).strip(),
            cities=cities,
            neighborhood=str(args.get("neighborhood", "")).strip(),
            budget=str(args.get("budget", "Moderate")).strip() or "Moderate",
            nights=int(args.get("nights", 5) or 5),
            stay_type=str(args.get("stay_type", args.get("stayType", "Hotel"))).strip() or "Hotel",
        )
    )
    return response.model_dump()

def search_memory(args: dict, repository) -> dict:
    query = str(args.get("query", "")).strip()

    # Tier 1: MCP bridge — text search via MCP protocol
    from app.integrations.mcp_bridge import mcp_bridge as _mcp
    if _mcp.is_initialized:
        try:
            mcp_results: list[dict] = []

            # Search trips collection by title/subtitle/dates
            trip_docs = _mcp.search_text(
                repository._settings.mongodb_trips_collection,
                query,
                fields=["title", "subtitle", "dates", "destination_pack_id"],
                limit=5,
            )
            for doc in trip_docs:
                snippet = " · ".join(
                    str(doc.get(k, ""))
                    for k in ("title", "subtitle", "dates")
                    if doc.get(k)
                )[:200] or str(doc.get("title") or "")

                # Compute a simple relevance score: how many query terms appear
                hit_count = _count_term_hits(query, snippet)
                mcp_results.append({
                    "id": str(doc.get("id") or doc.get("_id", "")),
                    "scope": "itinerary",
                    "title": str(doc.get("title") or "Saved trip"),
                    "snippet": snippet,
                    "score": min(1.0, round(hit_count / max(1, len(query.split())), 2)),
                })

            # Search destination packs collection
            pack_docs = _mcp.search_text(
                repository._settings.mongodb_destination_packs_collection,
                query,
                fields=["country", "regions", "cultural_notes", "transport_notes", "seasonal_notes"],
                limit=3,
            )
            for doc in pack_docs:
                snippet = " · ".join(
                    str(doc.get(k, ""))
                    for k in ("country", "regions", "cultural_notes")
                    if doc.get(k)
                )[:200] or str(doc.get("country", ""))
                hit_count = _count_term_hits(query, snippet)
                mcp_results.append({
                    "id": str(doc.get("id") or doc.get("_id", "")),
                    "scope": "destination",
                    "title": str(doc.get("country") or "Destination pack"),
                    "snippet": snippet,
                    "score": min(1.0, round(hit_count / max(1, len(query.split())), 2)),
                })

            if mcp_results:
                mcp_results.sort(key=lambda r: -r["score"])
                return {"source": "mongodb-mcp", "memory_results": mcp_results[:5]}
        except Exception:
            pass

    # Tier 2: Vector search via pymongo
    results = repository.vector_search_memory(query, limit=5)

    # Tier 3: Lexical mock search
    if not results:
        search_req = MemorySearchRequest(query=query, limit=5)
        results = repository.search_memory(search_req)

    return {
        "source": "mongodb-atlas-vector-search" if results else "lexical-mock",
        "memory_results": [
            {
                "id": r.id,
                "scope": r.scope,
                "title": r.title,
                "snippet": r.snippet,
                "score": r.score,
            }
            for r in results[:5]
        ],
    }


def _count_term_hits(query: str, haystack: str) -> int:
    """Count how many query terms appear in the haystack."""
    haystack_lower = haystack.lower()
    return sum(1 for term in query.split() if len(term) >= 2 and term.lower() in haystack_lower)
