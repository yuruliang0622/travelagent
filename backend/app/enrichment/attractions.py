import random
import re

from app.config import get_settings
from app.models import DestinationPack, Itinerary, MapPlace, PlaceCategory, PlanTripRequest
from app.integrations.maps import search_text_multi


ATTRACTION_AXES_BY_CITY = {
    "tokyo": ["top temple", "famous museum", "iconic park", "observation deck", "popular shrine", "shopping street", "historic district"],
    "kyoto": ["famous temple", "bamboo forest", "geisha district", "zen garden", "shrine", "tea house"],
    "osaka": ["castle", "famous landmark", "shopping arcade", "observation deck", "aquarium"],
    "nagoya": ["famous castle", "historic shrine", "science museum", "shopping arcade", "landmark tower"],
    "hakone": ["lake viewpoint", "hot spring landmark", "nature park", "open air museum", "scenic ropeway"],
    "bangkok": ["royal palace", "famous temple", "floating market", "rooftop bar viewpoint", "night market", "shopping mall"],
    "chiang mai": ["famous temple", "night bazaar", "old city wall", "viewpoint"],
    "phuket": ["famous beach", "viewpoint", "old town walk"],
    "rome": ["ancient ruins", "famous museum", "iconic piazza", "basilica", "fountain landmark"],
    "florence": ["famous museum", "duomo", "renaissance gallery", "piazza", "viewpoint"],
    "venice": ["famous basilica", "iconic bridge", "art museum", "piazza"],
    "milan": ["duomo", "fashion district", "famous museum", "historic gallery"],
    "new york city": ["iconic museum", "central park landmark", "observation deck", "famous bridge", "broadway theater", "shopping district"],
    "paris": ["famous museum", "iconic landmark", "historic cathedral", "garden", "shopping street"],
    "seoul": ["royal palace", "famous shopping district", "iconic tower", "hanok village", "art museum"],
}
ATTRACTION_AXES_DEFAULT = ["famous landmark", "popular museum", "iconic park", "historic district", "shopping street"]

FALLBACK_QUERIES = [
    "top tourist attractions",
    "famous landmarks",
    "best parks",
]

FOOD_KEYWORDS = ("restaurant", "café", "cafe", "ramen", "sushi", "izakaya", "bar", "grill", "steakhouse", "kitchen")


# Cache a larger pool per city, then randomly sample from it on each plan.
# Sampling happens AFTER the cache lookup, so it adds variety across
# regenerations without ever costing an extra Google call.
ATTRACTION_CACHE_POOL_SIZE = 30
PER_CITY_ATTRACTION_LIMIT = 10


def prefetch_attractions(
    request: PlanTripRequest,
    destination: str,
    destination_pack: DestinationPack,
) -> list[dict]:
    """Fetch real attraction candidates for every city on the route.

    Loops over ALL destination_pack.regions so prefetch covers the full route.
    Each city is served from the place cache when available, so regenerating a
    trip for the same destination reuses prior results instead of re-querying
    (and re-paying) Google. Each result includes a semantic tag and a tag-based
    description (full details are resolved later in Stage 3 for winners only).
    """
    settings = get_settings()
    if not settings.google_maps_api_key or not settings.enable_live_maps:
        return []

    profile = request.profile
    interests = (profile.interests or []) if profile else []

    results: list[dict] = []
    for city in destination_pack.regions:
        results.extend(_city_attractions(destination, city, interests))
    return results


def _city_attractions(destination: str, city: str, interests: list[str]) -> list[dict]:
    """Return attraction candidates for one city.

    A cached pool is reused when available (zero Google calls); otherwise we
    fetch a pool and cache it. Either way we randomly sample down to the
    per-city limit, so each regeneration sees a fresh mix without re-querying.
    """
    from app.storage.repository import repository

    pool = repository.get_cached_places("attraction", city)
    if pool is None:
        tagged_queries = _attraction_queries_for_city(destination, city, interests)
        pool = _select_attractions(tagged_queries, limit=ATTRACTION_CACHE_POOL_SIZE)
        repository.cache_places("attraction", city, pool)

    if len(pool) <= PER_CITY_ATTRACTION_LIMIT:
        return list(pool)
    return random.sample(pool, PER_CITY_ATTRACTION_LIMIT)


def _attraction_queries_for_city(
    destination: str, city: str, interests: list[str]
) -> list[tuple[str, str, str]]:
    """Build (query, city, tag) tuples for a single city."""
    city_search = f"{city}, {destination}" if city.lower() not in destination.lower() else destination
    tagged_queries: list[tuple[str, str, str]] = []

    # Interest-driven queries
    for interest in interests[:3]:
        tagged_queries.append((f"top {interest} {city_search}", city, interest))

    # City-specific axis queries
    axes = ATTRACTION_AXES_BY_CITY.get(city.lower(), ATTRACTION_AXES_DEFAULT)
    for axis in random.sample(axes, min(4, len(axes))):
        tagged_queries.append((f"{axis} {city_search}", city, _axis_to_tag(axis)))

    # Broad fallbacks
    for fb in FALLBACK_QUERIES:
        tagged_queries.append((f"{fb} {city_search}", city, "attraction"))

    return tagged_queries


# ── Tag derivation ────────────────────────────────────────────────────────────

def _axis_to_tag(axis: str) -> str:
    axis_lower = axis.lower()
    mapping = [
        ("temple", "temple"), ("shrine", "shrine"), ("museum", "museum"),
        ("gallery", "museum"), ("park", "park"), ("garden", "park"),
        ("observation deck", "viewpoint"), ("viewpoint", "viewpoint"),
        ("tower", "viewpoint"), ("shopping", "shopping"), ("market", "market"),
        ("historic", "historic"), ("old city", "historic"), ("hanok", "historic"),
        ("landmark", "landmark"), ("palace", "landmark"), ("duomo", "landmark"),
        ("basilica", "temple"), ("cathedral", "temple"), ("castle", "castle"),
        ("bamboo", "nature"), ("beach", "nature"), ("lake", "nature"),
        ("geisha", "culture"), ("tea house", "culture"), ("zen", "culture"),
        ("broadway", "culture"), ("fashion", "shopping"), ("bridge", "landmark"),
        ("fountain", "landmark"), ("renaissance", "museum"), ("piazza", "landmark"),
        ("aquarium", "attraction"), ("royal", "landmark"), ("floating", "market"),
        ("rooftop", "viewpoint"), ("night bazaar", "market"), ("night market", "market"),
        ("science museum", "museum"), ("hot spring", "wellness"),
        ("ropeway", "viewpoint"), ("open air", "museum"),
    ]
    for keyword, tag in mapping:
        if keyword in axis_lower:
            return tag
    return "attraction"


# ── Selection & enrichment ────────────────────────────────────────────────────

def _select_attractions(tagged_queries: list[tuple[str, str, str]], limit: int = 24) -> list[dict]:
    """Run queries, deduplicate, enrich with descriptions, select diverse results."""
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    all_hits: list[dict] = []

    for query, city, tag in tagged_queries:
        try:
            hits = search_text_multi(query, limit=4)
        except Exception:
            continue
        for hit in hits:
            pid = hit.get("place_id", "")
            if not pid or pid in seen_ids:
                continue
            name_lower = hit["name"].lower()
            if any(kw in name_lower for kw in FOOD_KEYWORDS):
                continue
            identity = _identity(hit["name"])
            if identity in seen_names:
                continue
            if identity == _identity(query):
                continue
            seen_ids.add(pid)
            seen_names.add(identity)
            all_hits.append({
                "name": hit["name"],
                "place_id": pid,
                "lat": hit.get("lat", 0.0),
                "lng": hit.get("lng", 0.0),
                "neighborhood": hit.get("neighborhood", ""),
                "rating": hit.get("rating"),
                "city": city,
                "tag": tag,
            })

    _enrich_with_descriptions(all_hits)

    # Shuffle for variety across plans, then select
    random.shuffle(all_hits)
    return all_hits[:limit]


_ATTRACTION_TAG_LABELS: dict[str, str] = {
    "temple": "Historic temple",
    "shrine": "Popular shrine",
    "museum": "Famous museum",
    "park": "Scenic park",
    "garden": "Serene garden",
    "viewpoint": "Panoramic viewpoint",
    "shopping": "Shopping street",
    "market": "Local market",
    "historic": "Historic district",
    "landmark": "Iconic landmark",
    "castle": "Historic castle",
    "nature": "Nature spot",
    "culture": "Cultural experience",
    "wellness": "Wellness retreat",
    "attraction": "Popular attraction",
}


def _label_for_attraction(attraction: dict) -> str:
    tag = (attraction.get("tag") or "").lower()
    return _ATTRACTION_TAG_LABELS.get(tag, "Local attraction")


def _enrich_with_descriptions(attractions: list[dict]) -> None:
    """Set a tag-based label as each attraction's description.

    We deliberately do NOT call Place Details here. Prefetch gathers far more
    candidates than survive into the final itinerary, so paying for a Place
    Details call on every candidate ran up a large Google bill for data the
    agent mostly discarded. Editorial summaries and full details are resolved
    later in Stage 3 (see planner._resolve_place_details) for winning segments
    only. Name, rating, and coordinates already come free from Text Search.
    """
    for attraction in attractions:
        if not attraction.get("description"):
            attraction["description"] = _label_for_attraction(attraction)


# ── Conversion ────────────────────────────────────────────────────────────────

def attraction_to_place(attraction: dict, slugger) -> MapPlace:
    return MapPlace(
        id=slugger(attraction["name"]),
        name=attraction["name"],
        category=PlaceCategory.attraction,
        neighborhood=attraction.get("neighborhood", ""),
        lat=attraction.get("lat", 0.0),
        lng=attraction.get("lng", 0.0),
        cost="$",
        duration="~1.5 hr",
        source="google-maps-places",
        why_it_fits=attraction.get("description") or "Highly rated local attraction.",
        google_maps_url=(
            f"https://www.google.com/maps/place/?q=place_id:{attraction['place_id']}"
            if attraction.get("place_id") else ""
        ),
        google_place_id=attraction.get("place_id", ""),
    )


def _identity(value: str) -> str:
    base = (value or "").lower()
    base = re.sub(r"[^a-z0-9]+", " ", base)
    return re.sub(r"\s+", " ", base).strip()


_MEAL_SKIP_KEYWORDS = (
    "lunch", "dinner", "breakfast", "brunch", "supper", "meal",
    "restaurant", "cafe", "café", "izakaya", "sushi", "ramen",
)


def replace_unknown_attractions(
    itinerary: Itinerary,
    prefetched: list[dict],
    slugger,
) -> Itinerary:
    """Replace segment titles that Gemini invented instead of using approved names.

    "Borrowed Scenery Garden" is a Gemini hallucination — the real place is
    Shōden-ji.  This pass matches every non-meal segment against the approved
    attraction list and swaps unknowns for real names from the same city.
    """
    if not prefetched:
        return itinerary

    updated_days = []
    for day in itinerary.days:
        city_attractions = [a for a in prefetched if (a.get("city") or "").lower() == day.area.lower()]
        if not city_attractions:
            updated_days.append(day)
            continue
        city_approved = {_identity(a["name"]): a for a in city_attractions}
        used_names: set[str] = set()

        updated_segments = []
        for seg in day.segments:
            combined = f"{seg.title.lower()} {(seg.description or '').lower()}"
            if any(kw in combined for kw in _MEAL_SKIP_KEYWORDS):
                updated_segments.append(seg)
                continue

            if _identity(seg.title) in city_approved:
                used_names.add(_identity(seg.title))
                updated_segments.append(seg)
                continue

            # Pick an unused real attraction from the same city
            replacement = next(
                (a for a in city_attractions if _identity(a["name"]) not in used_names),
                None,
            )
            if replacement is None:
                updated_segments.append(seg)
                continue

            used_names.add(_identity(replacement["name"]))
            rating_str = f" ⭐ {replacement['rating']}" if replacement.get("rating") else ""
            new_desc = (replacement.get("description") or seg.description or "") + rating_str
            local_id = slugger(replacement["name"])
            updated_segments.append(seg.model_copy(update={
                "title": replacement["name"],
                "description": new_desc.strip(),
                "place_ids": [local_id],
            }))

        updated_days.append(day.model_copy(update={"segments": updated_segments}))

    return itinerary.model_copy(update={"days": updated_days})
