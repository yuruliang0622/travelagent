import re
from dataclasses import dataclass

from app.models import Itinerary, ItinerarySegment, MapPlace, PlaceCategory, PlanTripRequest
from app.agent.request_helpers import destination_for_request, slug


@dataclass(frozen=True)
class IconicStop:
    name: str
    city: str
    category: PlaceCategory
    neighborhood: str
    lat: float
    lng: float
    cost: str
    duration: str
    why: str


JAPAN_ICONIC_STOPS = [
    IconicStop("Tokyo Tower", "tokyo", PlaceCategory.attraction, "Minato", 35.6586, 139.7454, "$$", "~1.5 hr", "Classic Tokyo skyline icon and easy first-time landmark."),
    IconicStop("Senso-ji Temple", "tokyo", PlaceCategory.culture, "Asakusa", 35.7148, 139.7967, "$", "~1.5 hr", "Tokyo's oldest temple and a strong intro to old Edo culture."),
    IconicStop("Meiji Jingu", "tokyo", PlaceCategory.culture, "Harajuku", 35.6764, 139.6993, "$", "~1.5 hr", "A calm Shinto shrine forest beside busy Harajuku."),
    IconicStop("Shibuya Crossing", "tokyo", PlaceCategory.attraction, "Shibuya", 35.6595, 139.7005, "$", "~45 min", "A globally recognized Tokyo street-life landmark."),
    IconicStop("Tsukiji Outer Market", "tokyo", PlaceCategory.shopping, "Tsukiji", 35.6655, 139.7707, "$$", "~1.5 hr", "Great for seafood snacks, street food, and market culture."),
    IconicStop("Lake Kawaguchiko Mount Fuji View", "hakone", PlaceCategory.attraction, "Fuji Five Lakes", 35.5171, 138.7518, "$$", "~3 hr", "One of the most reliable classic Mount Fuji viewing areas."),
    IconicStop("Hakone Ropeway", "hakone", PlaceCategory.attraction, "Hakone", 35.2440, 139.0245, "$$", "~2 hr", "Volcanic scenery, lake views, and a classic onsen-region route."),
    IconicStop("Hakone Open Air Museum", "hakone", PlaceCategory.culture, "Ninotaira", 35.2478, 139.0452, "$$", "~2 hr", "Japan's first open-air art museum with sculptures set against mountain scenery."),
    IconicStop("Owakudani Volcanic Valley", "hakone", PlaceCategory.attraction, "Owakudani", 35.2542, 139.0208, "$", "~1.5 hr", "Active volcanic valley with sulfur vents and panoramic views — uniquely Hakone."),
    IconicStop("Lake Ashi Cruise", "hakone", PlaceCategory.attraction, "Moto-Hakone", 35.1988, 139.0273, "$$", "~1 hr", "Scenic boat cruise on Lake Ashi with clear-day views of Mount Fuji."),
    IconicStop("Fushimi Inari Taisha", "kyoto", PlaceCategory.culture, "Fushimi", 34.9671, 135.7727, "$", "~2 hr", "Kyoto's famous vermilion torii gates and shrine mountain walk."),
    IconicStop("Kiyomizu-dera", "kyoto", PlaceCategory.culture, "Higashiyama", 34.9949, 135.7850, "$", "~2 hr", "Historic temple balcony with Kyoto city views."),
    IconicStop("Arashiyama Bamboo Grove", "kyoto", PlaceCategory.attraction, "Arashiyama", 35.0170, 135.6719, "$", "~1.5 hr", "A signature Kyoto nature walk paired with temples and river views."),
    IconicStop("Gion Evening Walk", "kyoto", PlaceCategory.culture, "Gion", 35.0038, 135.7750, "$", "~1 hr", "Traditional lanes, tea-house culture, and old Kyoto atmosphere."),
    IconicStop("Osaka Castle", "osaka", PlaceCategory.culture, "Chuo", 34.6873, 135.5262, "$", "~2 hr", "Osaka's major historic landmark with broad park grounds."),
    IconicStop("Dotonbori", "osaka", PlaceCategory.attraction, "Namba", 34.6687, 135.5013, "$$", "~2 hr", "Neon canal, street-food energy, and classic Osaka nightlife."),
    IconicStop("Umeda Sky Building", "osaka", PlaceCategory.attraction, "Umeda", 34.7053, 135.4896, "$$", "~1.5 hr", "Easy skyline viewpoint for a first Osaka visit."),
]

WEAK_STOP_PATTERNS = [
    r"samurai\s+ninja\s+museum",
    r"hotel\b",
    r"hoshinoya",
    r"edo\s+sakura",
    r"ryokan\b",
    r"explore\s+",
    r"wander\s+",
    r"free\s+time",
    r"neighborhood\s+walk",
]

# Keywords that represent unique attraction types — if one already appeared in
# the trip, any segment title containing the same keyword is treated as a duplicate.
SEMANTIC_DEDUP_KEYWORDS = [
    "ropeway", "cable car", "gondola",
    "lake ashi", "ashi cruise", "pirate ship",
    "owakudani",
    "fuji view", "kawaguchiko",
    "bamboo grove", "arashiyama bamboo",
    "fushimi inari",
]


def improve_itinerary_quality(itinerary: Itinerary, request: PlanTripRequest) -> Itinerary:
    """Light deterministic cleanup after Gemini.

    This guards the demo/product against common LLM itinerary failures:
    duplicate stops, weak filler attractions, and hotels used as attractions.
    It deliberately does not add cities, airports, forced onsen stops, or
    departure-day route logic.
    """
    destination = destination_for_request(request).lower()
    updated = itinerary
    if "japan" in destination:
        updated = _ensure_iconic_japan_places(updated)
        updated = _replace_duplicate_or_weak_japan_segments(updated)
    return updated


def _ensure_iconic_japan_places(itinerary: Itinerary) -> Itinerary:
    places = list(itinerary.places)
    existing = {_identity(place.name) for place in places}
    for stop in JAPAN_ICONIC_STOPS:
        if _identity(stop.name) in existing:
            continue
        places.append(_iconic_to_place(stop))
        existing.add(_identity(stop.name))
    return itinerary.model_copy(update={"places": places})


def _replace_duplicate_or_weak_japan_segments(itinerary: Itinerary) -> Itinerary:
    places_by_name = {_identity(place.name): place for place in itinerary.places}
    used_titles: set[str] = set()
    used_iconic: set[str] = set()
    used_semantic_keywords: set[str] = set()  # trip-wide semantic dedup
    updated_days = []

    for day in itinerary.days:
        city_hint = _city_hint(day.area, day.title)
        segments = []
        for segment in day.segments:
            ident = _identity(segment.title)
            place = _first_place(segment, itinerary.places)
            is_restaurant = place and place.category == PlaceCategory.restaurant
            is_hotel_as_activity = place and place.category == PlaceCategory.hotel and not _is_lodging_logistics(segment.title)
            needs_replacement = False
            if not is_restaurant:
                is_lodging_logistics = _is_lodging_logistics(segment.title)
                # Semantic keyword dedup: same attraction type already seen this trip
                seg_keywords = {kw for kw in SEMANTIC_DEDUP_KEYWORDS if kw in segment.title.lower()}
                is_semantic_duplicate = bool(seg_keywords & used_semantic_keywords)
                needs_replacement = (
                    ident in used_titles
                    or (not is_lodging_logistics and _is_weak_stop(segment.title))
                    or is_hotel_as_activity
                    or is_semantic_duplicate
                )

            if needs_replacement:
                replacement = _next_iconic_stop(city_hint, used_iconic | used_titles, places_by_name)
                if replacement:
                    segments.append(_segment_for_iconic(segment, replacement))
                    used_titles.add(_identity(replacement.name))
                    used_iconic.add(_identity(replacement.name))
                    rep_keywords = {kw for kw in SEMANTIC_DEDUP_KEYWORDS if kw in replacement.name.lower()}
                    used_semantic_keywords.update(rep_keywords)
                    continue

            segments.append(segment)
            if ident:
                used_titles.add(ident)
                seg_keywords = {kw for kw in SEMANTIC_DEDUP_KEYWORDS if kw in segment.title.lower()}
                used_semantic_keywords.update(seg_keywords)

        updated_days.append(day.model_copy(update={"segments": segments}))

    return itinerary.model_copy(update={"days": updated_days})


def _iconic_to_place(stop: IconicStop) -> MapPlace:
    query = f"{stop.name} Japan"
    return MapPlace(
        id=slug(stop.name),
        name=stop.name,
        category=stop.category,
        neighborhood=stop.neighborhood,
        lat=stop.lat,
        lng=stop.lng,
        cost=stop.cost,
        duration=stop.duration,
        source="trip-agent-curated-iconic-place",
        why_it_fits=stop.why,
        google_maps_url=f"https://www.google.com/maps/search/?api=1&query={query.replace(' ', '%20')}",
    )


def _segment_for_iconic(original: ItinerarySegment, place: MapPlace) -> ItinerarySegment:
    return original.model_copy(update={
        "title": place.name,
        "description": place.why_it_fits,
        "place_ids": [place.id],
        "travel_note": original.travel_note or "Agent will choose the simplest transit route.",
        "cost": place.cost,
    })


def _next_iconic_stop(city_hint: str, used: set[str], places_by_name: dict[str, MapPlace]) -> MapPlace | None:
    preferred = [s for s in JAPAN_ICONIC_STOPS if s.city == city_hint]
    for stop in preferred:
        ident = _identity(stop.name)
        if ident not in used and ident in places_by_name:
            return places_by_name[ident]
    return None


def _city_hint(*values: str) -> str:
    text = " ".join(values).lower()
    for city in ("tokyo", "hakone", "kyoto", "osaka"):
        if city in text:
            return city
    if "fuji" in text:
        return "hakone"
    return "tokyo"


def _first_place(segment: ItinerarySegment, places: list[MapPlace]) -> MapPlace | None:
    if not segment.place_ids:
        return None
    place_id = segment.place_ids[0]
    return next((place for place in places if place.id == place_id), None)


def _is_weak_stop(title: str) -> bool:
    text = title.lower()
    return any(re.search(pattern, text) for pattern in WEAK_STOP_PATTERNS)


def _is_lodging_logistics(title: str) -> bool:
    text = title.lower()
    return any(word in text for word in ("check-in", "check in", "luggage", "overnight", "stay", "sleep"))


def _identity(value: str) -> str:
    base = (value or "").lower()
    base = re.sub(r"[^a-z0-9]+", " ", base)
    return re.sub(r"\s+", " ", base).strip()
