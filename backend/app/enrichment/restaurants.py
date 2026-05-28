import random
import re

from app.config import get_settings
from app.models import DestinationPack, Itinerary, ItineraryDay, ItinerarySegment, MapPlace, PlaceCategory, PlanTripRequest
from app.integrations.maps import search_text_multi, validate_places as maps_validate_places


CUISINE_AXES_BY_CITY = {
    "tokyo": ["ramen", "sushi", "izakaya", "tempura", "yakitori", "soba", "tonkatsu", "udon", "kaiseki"],
    "kyoto": ["kaiseki", "yudofu", "matcha cafe", "obanzai", "soba", "kushikatsu"],
    "osaka": ["takoyaki", "okonomiyaki", "kushikatsu", "ramen", "sushi"],
    "bangkok": ["pad thai", "tom yum", "som tum", "green curry", "boat noodles", "mango sticky rice", "street food"],
    "chiang mai": ["khao soi", "northern thai", "street food market"],
    "phuket": ["seafood", "thai curry", "beach restaurant"],
    "rome": ["pasta carbonara", "roman pizza", "trattoria", "gelato", "suppli"],
    "florence": ["bistecca fiorentina", "tuscan", "trattoria", "wine bar"],
    "venice": ["cicchetti bar", "seafood risotto", "bacaro"],
    "milan": ["risotto milanese", "osteria", "aperitivo bar"],
    "new york city": ["pizza slice", "bagel", "deli", "ramen", "steakhouse", "dim sum", "burger"],
    "paris": ["bistro", "boulangerie", "brasserie", "creperie", "wine bar"],
    "seoul": ["korean bbq", "bibimbap", "fried chicken", "soft tofu stew", "street food market"],
}
CUISINE_AXES_DEFAULT = ["local specialty", "popular restaurant", "street food", "breakfast spot", "lunch cafe"]

MEAL_KEYWORDS = {
    "lunch", "dinner", "breakfast", "brunch", "supper", "meal",
    "eat", "dine", "taste", "savor", "feast",
    "restaurant", "cafe", "café", "bistro", "brasserie", "eatery",
    "izakaya", "trattoria", "osteria", "tavern", "diner", "pub",
    "bakery", "patisserie", "deli", "noodle shop", "food hall",
    "ramen", "sushi", "tempura", "yakitori", "udon", "soba",
    "dim sum", "pho", "pad thai", "tapas", "pasta", "pizza",
    "cuisine", "flavors", "flavours", "delights", "delicious",
    "culinary", "gastronomy", "fare",
    "snack", "tasting", "food", "coffee break", "tea time", "treat",
}

BREAKFAST_KEYWORDS = {
    "breakfast", "brunch", "omelet", "omelette", "pancake", "waffle",
    "early bird", "morning", "benedict", "croissant", "bagel", "pastry",
    "donut", "muffin", "french toast", "granola", "yogurt parfait",
    "cereal", "smoothie bowl", "acai", "fruit bowl",
}


def prefetch_restaurants(
    request: PlanTripRequest,
    destination: str,
    destination_pack: DestinationPack,
) -> list[dict]:
    """Fetch real restaurant candidates for every city on the route.

    Loops over ALL destination_pack.regions so cuisine prefetch covers the
    full route. Each result is tagged with its cuisine type and city.
    """
    settings = get_settings()
    if not settings.google_maps_api_key or not settings.enable_live_maps:
        return []

    profile = request.profile
    food_prefs = profile.food_preferences if profile else []

    dietary_kw = {"vegetarian", "vegan", "halal", "gluten", "allerg", "kosher"}
    cuisine_kw = {"street food", "fusion", "local", "traditional", "coastal", "market", "cuisine"}
    dining_kw = {"quick", "casual", "fine dining", "sit-down"}

    dietary = next(
        (p for p in food_prefs if any(k in p.lower() for k in dietary_kw) and "no restriction" not in p.lower()),
        "",
    )
    cuisine = next((p for p in food_prefs if any(k in p.lower() for k in cuisine_kw)), "")
    dining = next((p for p in food_prefs if any(k in p.lower() for k in dining_kw)), "")
    diet_prefix = f"{dietary} " if dietary else ""

    # Build queries per city
    all_tagged_queries: list[tuple[str, str, str]] = []  # (query, city, tag)
    for city in destination_pack.regions:
        city_search = f"{city}, {destination}" if city.lower() not in destination.lower() else destination
        city_queries = _restaurant_queries_for_city(city_search, city, cuisine, dining, diet_prefix)
        all_tagged_queries.extend(city_queries)

    if not all_tagged_queries:
        return []

    return _select_restaurant_candidates_v2(all_tagged_queries)


def apply_validated_coords(itinerary: Itinerary, prefetched: list[dict] | None = None) -> Itinerary:
    """Overwrite place lat/lng with real Google Maps coordinates when possible."""
    if not itinerary.places:
        return itinerary

    coords_by_name: dict[str, tuple[float, float]] = {}
    if prefetched:
        for restaurant in prefetched:
            if restaurant.get("lat") and restaurant.get("lng"):
                coords_by_name[restaurant["name"]] = (restaurant["lat"], restaurant["lng"])

    non_restaurant = [place.name for place in itinerary.places if place.name not in coords_by_name]
    if non_restaurant:
        try:
            validated = maps_validate_places(non_restaurant)
            for place in validated:
                if place.get("lat") and place.get("lng"):
                    coords_by_name[place["name"]] = (place["lat"], place["lng"])
        except Exception:
            pass

    updated_places = []
    for place in itinerary.places:
        lat, lng = coords_by_name.get(place.name, (place.lat, place.lng))
        updated_places.append(place.model_copy(update={"lat": lat, "lng": lng}))
    return itinerary.model_copy(update={"places": updated_places})


def apply_real_restaurants(
    itinerary: Itinerary,
    prefetched: list[dict],
    slugger,
    attractions: list[dict] | None = None,
) -> Itinerary:
    """Replace generic meal stops with real Google Maps restaurant names.

    `attractions` (optional): pre-fetched real attractions. When overflow
    meal segments are demoted (cap of 2 meals/day), the demoted slot is filled
    with a real attraction instead of writing "Explore {area}".
    """
    if not prefetched:
        return itinerary

    from app.enrichment.attractions import attraction_to_place

    real_names_by_identity = {restaurant_identity(r["name"]): r for r in prefetched}
    existing_lower = {restaurant_identity(place.name) for place in itinerary.places}
    extra_places = _extra_restaurant_places(prefetched, existing_lower, slugger)

    # Inject pre-fetched attractions into the places list so demoted meal slots
    # can reference real attraction names (with real coords + Maps link).
    attraction_places: list[MapPlace] = []
    if attractions:
        for attraction in attractions:
            ident = restaurant_identity(attraction["name"])
            if ident in existing_lower or any(restaurant_identity(p.name) == ident for p in extra_places):
                continue
            attraction_places.append(attraction_to_place(attraction, slugger))

    all_places = list(itinerary.places) + extra_places + attraction_places
    place_id_map = {restaurant_identity(place.name): place.id for place in all_places}
    updated_days = _replace_meal_segments(itinerary.days, prefetched, real_names_by_identity, place_id_map)
    updated_days = _limit_meal_segments_per_day(updated_days, all_places, attractions or [], place_id_map, max_meals=2)
    return itinerary.model_copy(update={"days": updated_days, "places": all_places})


def restaurant_identity(value: str) -> str:
    """Normalize Maps/Gemini restaurant names for duplicate detection."""
    base = (value or "").split("|", 1)[0].lower()
    base = re.sub(r"[^a-z0-9]+", " ", base)
    return re.sub(r"\s+", " ", base).strip()


def _is_breakfast_restaurant(restaurant: dict) -> bool:
    """Check if a restaurant is breakfast-focused by name or tag."""
    name_lower = (restaurant.get("name") or "").lower()
    tag_lower = (restaurant.get("tag") or "").lower()
    combined = f"{name_lower} {tag_lower}"
    return any(kw in combined for kw in BREAKFAST_KEYWORDS)


def _filter_geographic_outliers(restaurants: list[dict]) -> list[dict]:
    """Remove restaurants far from the group center (~500 km threshold).

    Google Maps sometimes returns results on the wrong continent for English
    names.  The median of all returned coordinates defines the real destination
    and anything more than ~5 degrees away is treated as noise.
    """
    if len(restaurants) < 3:
        return restaurants
    lats = sorted(r.get("lat", 0) or 0 for r in restaurants if r.get("lat"))
    lngs = sorted(r.get("lng", 0) or 0 for r in restaurants if r.get("lng"))
    if not lats or not lngs:
        return restaurants
    median_lat = lats[len(lats) // 2]
    median_lng = lngs[len(lngs) // 2]
    MAX_DEG = 5.0
    return [
        r for r in restaurants
        if abs((r.get("lat") or median_lat) - median_lat) < MAX_DEG
        and abs((r.get("lng") or median_lng) - median_lng) < MAX_DEG
    ]


def _restaurant_queries_for_city(
    destination: str, city: str, cuisine: str, dining: str, diet_prefix: str
) -> list[tuple[str, str, str]]:
    """Build (query, city, cuisine_tag) tuples for a single city."""
    tagged: list[tuple[str, str, str]] = []
    cuisine_lower = cuisine.lower()
    dining_lower = dining.lower()

    if "street food" in cuisine_lower or "market" in cuisine_lower:
        tagged += [
            (f"best street food market {destination}", city, "street food"),
            (f"popular food stall {destination}", city, "street food"),
        ]
    elif "local" in cuisine_lower or "traditional" in cuisine_lower:
        tagged += [
            (f"{diet_prefix}popular local restaurant {destination}", city, "local"),
            (f"highly rated traditional restaurant {destination}", city, "local"),
        ]
    elif "fusion" in cuisine_lower:
        tagged.append((f"{diet_prefix}modern fusion restaurant {destination}", city, "fusion"))
    elif "seafood" in cuisine_lower or "coastal" in cuisine_lower:
        tagged.append((f"fresh seafood restaurant {destination}", city, "seafood"))

    if "fine dining" in dining_lower:
        tagged.append((f"{diet_prefix}fine dining restaurant {destination}", city, "fine dining"))
    elif "casual" in dining_lower:
        tagged.append((f"{diet_prefix}casual popular restaurant {destination}", city, "casual"))
    elif "quick" in dining_lower:
        tagged.append((f"popular quick eat {diet_prefix}{destination}", city, "quick"))

    cuisine_axes = CUISINE_AXES_BY_CITY.get(city.lower(), CUISINE_AXES_DEFAULT)
    for axis in random.sample(cuisine_axes, min(4, len(cuisine_axes))):
        tagged.append((f"best {diet_prefix}{axis} {destination}", city, axis))

    tagged += [
        (f"highly rated {diet_prefix}restaurant {destination}", city, "local"),
        (f"famous {destination} restaurant", city, "local"),
    ]
    return tagged


def _select_restaurant_candidates_v2(
    tagged_queries: list[tuple[str, str, str]], limit: int = 10
) -> list[dict]:
    """Run tagged queries, deduplicate by identity, return enriched results."""
    seen_names: set[str] = set()
    all_hits: list[dict] = []

    for query, city, tag in tagged_queries:
        try:
            hits = search_text_multi(query, limit=3)
        except Exception:
            continue
        for hit in hits:
            identity = restaurant_identity(hit["name"])
            if not identity or identity in seen_names:
                continue
            if identity == restaurant_identity(query):
                continue
            seen_names.add(identity)
            all_hits.append({
                "name": hit["name"],
                "lat": hit.get("lat", 0.0),
                "lng": hit.get("lng", 0.0),
                "place_id": hit.get("place_id", ""),
                "rating": hit.get("rating"),
                "user_ratings_total": hit.get("user_ratings_total"),
                "neighborhood": hit.get("neighborhood", ""),
                "city": city,
                "tag": tag,
            })

    # Keep existing fields for downstream compatibility
    _enrich_restaurant_details(all_hits)

    all_hits = _filter_geographic_outliers(all_hits)

    random.shuffle(all_hits)
    return all_hits[:limit]


def _enrich_restaurant_details(restaurants: list[dict]) -> None:
    """Fetch price + review_highlight via Place Details for restaurants that lack them."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from app.integrations.maps import get_place_details

    def fetch(idx: int, pid: str) -> tuple[int, dict]:
        return idx, get_place_details(pid)

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(fetch, i, r["place_id"]): i
            for i, r in enumerate(restaurants)
            if r.get("place_id")
        }
        for future in as_completed(futures):
            idx, details = future.result()
            if details:
                if details.get("price") and not restaurants[idx].get("price"):
                    restaurants[idx]["price"] = details["price"]
                if details.get("review_highlight") and not restaurants[idx].get("review_highlight"):
                    restaurants[idx]["review_highlight"] = details["review_highlight"]
                if details.get("rating") and not restaurants[idx].get("rating"):
                    restaurants[idx]["rating"] = details["rating"]


def _extra_restaurant_places(prefetched: list[dict], existing_lower: set[str], slugger) -> list[MapPlace]:
    extra_places: list[MapPlace] = []
    for restaurant in prefetched:
        if restaurant_identity(restaurant["name"]) in existing_lower:
            continue
        extra_places.append(
            MapPlace(
                id=slugger(restaurant["name"]),
                name=restaurant["name"],
                category=PlaceCategory.restaurant,
                neighborhood=restaurant.get("neighborhood", ""),
                lat=restaurant.get("lat", 0.0),
                lng=restaurant.get("lng", 0.0),
                cost=restaurant.get("price", "$"),
                duration="~1 hr",
                source="google-maps-places",
                why_it_fits=(restaurant.get("review_highlight") or "Highly rated local restaurant")[:100],
                google_maps_url=restaurant.get("google_maps_url", ""),
            )
        )
    return extra_places


def _parse_hour(time_str: str) -> int | None:
    """Extract the hour (0-23) from segment.time strings like '12:30', '7am', '19:00'."""
    if not time_str:
        return None
    match = re.search(r"(\d{1,2})\s*[:.]?\s*\d{0,2}\s*(am|pm)?", time_str.lower())
    if not match:
        return None
    try:
        hour = int(match.group(1))
    except (ValueError, TypeError):
        return None
    ampm = match.group(2)
    if ampm == "pm" and hour < 12:
        hour += 12
    elif ampm == "am" and hour == 12:
        hour = 0
    return hour if 0 <= hour <= 23 else None


def _is_valid_meal_time(hour: int | None) -> bool:
    """Breakfast 7-10, lunch 11-14, dinner 18-21. Outside these = not a real meal slot."""
    if hour is None:
        return True  # if we can't parse, don't reject
    return hour in {7, 8, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21}


def _limit_meal_segments_per_day(
    days: list[ItineraryDay],
    all_places: list[MapPlace],
    attractions: list[dict],
    place_id_map: dict[str, str],
    max_meals: int = 2,
) -> list[ItineraryDay]:
    """Enforce balanced daily schedule with strict rules:

    - Max `max_meals` restaurant-linked segments per day
    - Each meal must fall in a valid meal-time window (breakfast/lunch/dinner)
    - Min 3hr gap between meals on the same day
    - No restaurant appears twice across the whole trip
    - Overflow / out-of-window / duplicate meals get swapped with real attractions
    """
    if max_meals < 0:
        return days

    restaurant_place_ids = {
        place.id for place in all_places if place.category == PlaceCategory.restaurant
    }

    # Track attractions already scheduled — avoid duplicates when swapping
    existing_attraction_idents: set[str] = set()
    for day in days:
        for segment in day.segments:
            for pid in segment.place_ids:
                place = next((p for p in all_places if p.id == pid), None)
                if place and place.category == PlaceCategory.attraction:
                    existing_attraction_idents.add(restaurant_identity(place.name))

    attraction_queue = [a for a in attractions if restaurant_identity(a["name"]) not in existing_attraction_idents]
    attraction_idx = 0

    def next_attraction() -> dict | None:
        nonlocal attraction_idx
        if not attraction_queue:
            return None
        attraction = attraction_queue[attraction_idx % len(attraction_queue)]
        attraction_idx += 1
        return attraction

    def demote_to_attraction(segment: ItinerarySegment, day_area: str) -> ItinerarySegment:
        stripped_desc = re.split(r"\s*⭐", segment.description or "")[0].strip()
        attraction = next_attraction()
        if attraction:
            pid = place_id_map.get(restaurant_identity(attraction["name"]), "")
            rating_str = f" ⭐ {attraction['rating']}" if attraction.get("rating") else ""
            new_desc = (stripped_desc or "A highly rated local attraction.") + rating_str
            return segment.model_copy(update={
                "title": attraction["name"],
                "description": new_desc.strip(),
                "place_ids": [pid] if pid else [],
            })
        area = day_area or "the area"
        return segment.model_copy(update={
            "title": f"Explore {area}",
            "description": stripped_desc or f"Wander around {area}.",
            "place_ids": [],
        })

    used_restaurants_globally: set[str] = set()  # cross-day uniqueness
    updated_days: list[ItineraryDay] = []

    for day in days:
        meals_kept_today = 0
        last_meal_hour: int | None = None
        updated_segments: list[ItinerarySegment] = []

        for segment in day.segments:
            is_meal_link = bool(segment.place_ids) and any(
                pid in restaurant_place_ids for pid in segment.place_ids
            )

            if not is_meal_link:
                updated_segments.append(segment)
                continue

            # This segment links to a restaurant — apply all the rules
            hour = _parse_hour(segment.time)
            restaurant_ident = restaurant_identity(segment.title)

            reject_reason = None
            if meals_kept_today >= max_meals:
                reject_reason = "over daily cap"
            elif not _is_valid_meal_time(hour):
                reject_reason = "not a meal time"
            elif last_meal_hour is not None and hour is not None and abs(hour - last_meal_hour) < 3:
                reject_reason = "too close to previous meal"
            elif restaurant_ident in used_restaurants_globally:
                reject_reason = "duplicate restaurant"

            if reject_reason is None:
                meals_kept_today += 1
                last_meal_hour = hour if hour is not None else last_meal_hour
                used_restaurants_globally.add(restaurant_ident)
                updated_segments.append(segment)
            else:
                updated_segments.append(demote_to_attraction(segment, day.area))

        updated_days.append(day.model_copy(update={"segments": updated_segments}))

    return updated_days


def _replace_meal_segments(
    days: list[ItineraryDay],
    prefetched: list[dict],
    real_names_by_identity: dict[str, dict],
    place_id_map: dict[str, str],
) -> list[ItineraryDay]:
    queue = list(prefetched)
    q_idx = 0
    used_restaurants: set[str] = set()
    updated_days: list[ItineraryDay] = []

    def next_unused_restaurant(preferred_city: str = "", skip_breakfast: bool = False) -> dict | None:
        nonlocal q_idx
        if not queue:
            return None

        def _good(restaurant: dict, city_key: str) -> bool:
            identity = restaurant_identity(restaurant["name"])
            if identity in used_restaurants:
                return False
            if city_key:
                restaurant_city = (restaurant.get("city") or "").strip().lower()
                if restaurant_city != city_key:
                    return False
            if skip_breakfast and _is_breakfast_restaurant(restaurant):
                return False
            return True

        city_key = preferred_city.strip().lower()
        # First pass: same-city match with all filters
        if city_key:
            for _ in range(len(queue)):
                restaurant = queue[q_idx % len(queue)]
                q_idx += 1
                if _good(restaurant, city_key):
                    used_restaurants.add(restaurant_identity(restaurant["name"]))
                    return restaurant
            q_idx = 0
        # Second pass: any-city match with all filters
        for _ in range(len(queue)):
            restaurant = queue[q_idx % len(queue)]
            q_idx += 1
            if _good(restaurant, ""):
                used_restaurants.add(restaurant_identity(restaurant["name"]))
                return restaurant
        # Desperate fallback: any unused
        restaurant = queue[q_idx % len(queue)]
        q_idx += 1
        used_restaurants.add(restaurant_identity(restaurant["name"]))
        return restaurant

    for day in days:
        updated_segments: list[ItinerarySegment] = []
        for segment in day.segments:
            updated_segments.append(
                _replace_segment_if_meal(
                    segment,
                    real_names_by_identity,
                    place_id_map,
                    used_restaurants,
                    next_unused_restaurant,
                    day.area,
                    _parse_hour(segment.time),
                )
            )
        updated_days.append(day.model_copy(update={"segments": updated_segments}))
    return updated_days


def _replace_segment_if_meal(
    segment: ItinerarySegment,
    real_names_by_identity: dict[str, dict],
    place_id_map: dict[str, str],
    used_restaurants: set[str],
    next_unused_restaurant,
    preferred_city: str = "",
    hour: int | None = None,
) -> ItinerarySegment:
    combined = f"{segment.title.lower()}  {(segment.description or '').lower()}"
    is_meal = any(keyword in combined for keyword in MEAL_KEYWORDS)
    normalized_combined = restaurant_identity(combined)
    matched_identity = next(
        (identity for identity in real_names_by_identity if identity and identity in normalized_combined),
        "",
    )

    if is_meal and matched_identity and matched_identity not in used_restaurants:
        used_restaurants.add(matched_identity)
        place_id = place_id_map.get(matched_identity, "")
        return segment.model_copy(update={"place_ids": [place_id] if place_id else segment.place_ids})

    if not is_meal:
        return segment

    # Don't assign breakfast/brunch restaurants to dinner slots (17:00+)
    is_evening = hour is not None and hour >= 17
    restaurant = next_unused_restaurant(preferred_city, skip_breakfast=is_evening)
    if restaurant is None:
        return segment

    rating = f"⭐ {restaurant['rating']}" if restaurant.get("rating") else ""
    review = (restaurant.get("review_highlight") or "")[:140]
    extra = "  ·  ".join(part for part in [rating, review] if part)
    new_description = f"{segment.description}  {extra}".strip() if extra else segment.description
    place_id = place_id_map.get(restaurant_identity(restaurant["name"]), "")
    return segment.model_copy(update={
        "title": restaurant["name"],
        "description": new_description,
        "place_ids": [place_id] if place_id else segment.place_ids,
    })
