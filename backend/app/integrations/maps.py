import re
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.config import get_settings

_PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
_TIMEOUT_SECONDS = 2
_MAX_PLACES = 12

# Filler words/phrases that make Google Maps text search fail to match.
_FILLER_SUFFIXES = (
    r"\b(stroll|walk|visit|explore|exploration|tour|sightseeing"
    r"|excursion|wander|discover|discovery|experience|adventure"
    r"|jaunt|ramble|roam|outing|hop|stop|break|loop"
    r"|highlights?|snapshot|glimpse|immersion|trail"
    r"|dinner|lunch|breakfast|snack)\b"
)
_FILLER_PREFIXES = (
    r"^(visit|explore|discover|wander\s+through|tour\s+of|walk\s+through|stroll\s+through"
    r"|check\s+out|stop\s+at|see\s+the)\s+"
)

# Multi-word filler phrases (plain substring replacement, case-insensitive).
_FILLER_PHRASES = (
    "late-morning", "early-morning", "mid-morning",
    "at dusk", "at dawn", "at night", "at golden hour",
    "food stop", "photo stop", "rest stop",
    "in the morning", "in the afternoon", "in the evening",
)

def _clean_place_name(name: str) -> str:
    """Strip filler words so Google Maps text search can match the real place name."""
    cleaned = name
    # Multi-word phrases first (plain replace)
    for phrase in _FILLER_PHRASES:
        cleaned = re.sub(re.escape(phrase), "", cleaned, flags=re.IGNORECASE)
    # Prefix patterns ("Explore X", "Wander through Y")
    cleaned = re.sub(_FILLER_PREFIXES, "", cleaned, flags=re.IGNORECASE)
    # Single-word filler suffixes
    cleaned = re.sub(_FILLER_SUFFIXES, "", cleaned, flags=re.IGNORECASE)
    # Collapse whitespace, strip trailing punctuation
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-;:")
    return cleaned or name


def validate_places(place_names: list[str]) -> list[dict]:
    """Validate place names via Google Maps Places Text Search API.

    Returns a list of dicts with keys: name, lat, lng, place_id.
    Falls back to zero-coordinate entries if the API is disabled or a call fails.
    """
    settings = get_settings()
    if not settings.google_maps_api_key or not settings.enable_live_maps:
        return [{"name": name, "lat": 0.0, "lng": 0.0, "place_id": ""} for name in place_names]

    results: list[dict] = []
    for name in place_names[:_MAX_PLACES]:
        result = _search_one(name, settings.google_maps_api_key)
        results.append(result)
    return results


def get_place_details(place_id: str) -> dict:
    """Fetch rating, price level, and a review snippet for a known place_id."""
    settings = get_settings()
    if not settings.google_maps_api_key or not place_id:
        return {}
    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            resp = client.get(
                _PLACES_DETAILS_URL,
                params={
                    "place_id": place_id,
                    "fields": "name,rating,user_ratings_total,price_level,editorial_summary",
                    "key": settings.google_maps_api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "OK":
                return {}
            result = data.get("result", {})

            # Only use Google's curated editorial summary — never user reviews
            editorial = (result.get("editorial_summary") or {}).get("overview", "")
            review_highlight = editorial

            price_symbols = {1: "$", 2: "$$", 3: "$$$", 4: "$$$$"}
            price_level = result.get("price_level")

            return {
                "rating": result.get("rating"),
                "user_ratings_total": result.get("user_ratings_total"),
                "price": price_symbols.get(price_level, ""),
                "review_highlight": review_highlight,
            }
    except (httpx.HTTPError, KeyError, ValueError):
        pass
    return {}


def _search_one(name: str, api_key: str) -> dict:
    query = _clean_place_name(name)
    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            resp = client.get(
                _PLACES_TEXT_SEARCH_URL,
                params={"query": query, "key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "OK" and data.get("results"):
                hit = data["results"][0]
                loc = hit.get("geometry", {}).get("location", {})
                return {
                    "name": hit.get("name") or name,
                    "lat": loc.get("lat", 0.0),
                    "lng": loc.get("lng", 0.0),
                    "place_id": hit.get("place_id", ""),
                }
    except (httpx.HTTPError, KeyError, ValueError):
        pass
    return {"name": name, "lat": 0.0, "lng": 0.0, "place_id": ""}


def search_text_multi(query: str, limit: int = 5) -> list[dict]:
    """Return up to `limit` results from Google Maps Places Text Search.

    Unlike validate_places (single best match), this returns multiple candidates
    so we can build variety into restaurant pre-fetch.
    """
    settings = get_settings()
    if not settings.google_maps_api_key or not settings.enable_live_maps:
        return []
    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            resp = client.get(
                _PLACES_TEXT_SEARCH_URL,
                params={"query": query, "key": settings.google_maps_api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "OK":
                return []
            out: list[dict] = []
            for hit in (data.get("results") or [])[:limit]:
                if not hit.get("name"):
                    continue
                loc = hit.get("geometry", {}).get("location", {})
                out.append({
                    "name": hit["name"],
                    "lat": loc.get("lat", 0.0),
                    "lng": loc.get("lng", 0.0),
                    "place_id": hit.get("place_id", ""),
                    "rating": hit.get("rating"),
                    "user_ratings_total": hit.get("user_ratings_total"),
                    "neighborhood": hit.get("vicinity", ""),
                })
            return out
    except (httpx.HTTPError, KeyError, ValueError):
        return []


def get_place_details_full(place_id: str) -> dict:
    """Fetch full place details: phone, hours, website, photos for Stage 3 resolve."""
    settings = get_settings()
    if not settings.google_maps_api_key or not place_id:
        return {}
    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            resp = client.get(
                _PLACES_DETAILS_URL,
                params={
                    "place_id": place_id,
                    "fields": "name,formatted_phone_number,opening_hours,website,photos,url,editorial_summary,price_level,rating,user_ratings_total",
                    "key": settings.google_maps_api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "OK":
                return {}
            result = data.get("result", {})
            photos = result.get("photos") or []
            return {
                "phone": result.get("formatted_phone_number", ""),
                "opening_hours": (result.get("opening_hours") or {}).get("weekday_text", []),
                "website": result.get("website", ""),
                "photo_urls": [
                    f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference={p['photo_reference']}&key={settings.google_maps_api_key}"
                    for p in photos[:3]
                ],
                "google_maps_url": result.get("url", ""),
                "editorial_summary": (result.get("editorial_summary") or {}).get("overview", ""),
                "price_level": result.get("price_level"),
                "rating": result.get("rating"),
                "user_ratings_total": result.get("user_ratings_total"),
            }
    except (httpx.HTTPError, KeyError, ValueError):
        pass
    return {}


def batch_get_place_details(place_ids: list[str]) -> dict[str, dict]:
    """Fetch full details for multiple places in parallel."""
    if not place_ids:
        return {}

    results: dict[str, dict] = {}

    def fetch(pid: str) -> tuple[str, dict]:
        return pid, get_place_details_full(pid)

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(fetch, pid) for pid in place_ids if pid]
        for future in as_completed(futures):
            pid, details = future.result()
            if details:
                results[pid] = details

    return results
