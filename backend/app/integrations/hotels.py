import random
import re
from urllib.parse import quote_plus

import httpx

from app.config import get_settings
from app.integrations.maps import get_place_details, search_text_multi
from app.models import HotelOption, HotelSearchRequest, HotelSearchResponse


def search_hotel_options(request: HotelSearchRequest) -> HotelSearchResponse:
    """Return selectable hotel options.

    Uses Google Maps Places API for real hotel names + ratings + reviews when
    ENABLE_LIVE_MAPS is on. Falls back to mock options otherwise.
    """
    destination = request.destination.strip() or "destination"
    area = _area_from_preference(destination, request.neighborhood)
    nightly = _nightly_budget(request.budget)
    nights = max(1, request.nights)

    cities = request.cities or []
    settings = get_settings()
    serpapi_matches = _serpapi_google_hotels(request, destination, area, settings.serpapi_api_key) if settings.serpapi_api_key else []
    if settings.google_maps_api_key and settings.enable_live_maps:
        live = _live_hotels(request, destination, area, cities, nightly, nights, serpapi_matches)
        if live:
            return live

    if serpapi_matches:
        return _serpapi_only_response(request, destination, area, nightly, nights, serpapi_matches)

    curated = _curated_japan_hotels(destination, area, nightly, nights, request.check_in, request.check_out)
    if curated:
        return curated

    return _mock_hotels(destination, area, nightly, nights, request.check_in, request.check_out)


def _live_hotels(
    request: HotelSearchRequest,
    destination: str,
    area: str,
    cities: list[str],
    nightly: int,
    nights: int,
    serpapi_matches: list[dict] | None = None,
) -> HotelSearchResponse | None:
    """Query Google Maps for real hotels, per-city when itinerary cities are known."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # Determine which cities to search
    targets = list(cities) if cities else [area if area else destination]

    # Build all queries across all cities
    all_queries: list[tuple[str, str]] = []  # (query, city)
    for city in targets:
        city_queries = _hotel_queries_for_city(city, request.stay_type, request.budget)
        all_queries.extend((q, city) for q in city_queries)

    # Search in parallel
    seen_names: set[str] = set()
    pool: list[dict] = []

    def search(query: str, city: str) -> list[dict]:
        results = []
        try:
            hits = search_text_multi(query, limit=3)
        except Exception:
            return results
        for hit in hits:
            ident = _identity(hit.get("name") or "")
            if not ident or ident in seen_names:
                continue
            if ident == _identity(query):
                continue
            name_lower = hit["name"].lower()
            if any(kw in name_lower for kw in ("restaurant", "café", "cafe", "ramen", "sushi", "izakaya", "museum", "park", "shrine", "temple", "station")):
                continue
            seen_names.add(ident)
            hit["_city"] = city
            results.append(hit)
        return results

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(search, q, c): (q, c) for q, c in all_queries[:12]}
        for future in as_completed(futures):
            pool.extend(future.result())

    if not pool:
        return None

    random.shuffle(pool)
    selected = pool[:4]

    budget_label = request.budget or "Moderate"
    options: list[HotelOption] = []
    serpapi_by_name = {match["identity"]: match for match in serpapi_matches or [] if match.get("identity")}
    for hit in selected:
        details = get_place_details(hit["place_id"]) if hit.get("place_id") else {}
        serp = serpapi_by_name.get(_identity(hit["name"])) or _find_serpapi_match(hit["name"], serpapi_matches or [])
        price_modifier = _price_modifier_from_details(details, hit, budget_label)
        per_night = _serpapi_price(serp) or max(50, round(nightly * price_modifier))
        review_snippet = (details.get("review_highlight") or "").strip()
        highlights = _hotel_highlights(hit.get("_city", area), review_snippet, details, serp)
        booking_url = (serp or {}).get("link") or _google_hotels_url(hit["name"], hit.get("_city", area), request.check_in, request.check_out)
        options.append(
            HotelOption(
                id=_slug(hit["name"]),
                name=hit["name"],
                area=hit.get("_city", area),
                rating=float(details.get("rating") or hit.get("rating") or 0.0),
                review_count=int(details.get("user_ratings_total") or hit.get("user_ratings_total") or 0),
                price_per_night_usd=per_night,
                total_estimate_usd=per_night * nights,
                highlights=highlights,
                booking_url=booking_url,
                source="google-maps-places+serpapi-google-hotels" if serp else "google-maps-places",
            )
        )

    city_list = ", ".join(targets[:3])
    return HotelSearchResponse(
        mode="provider",
        provider="google-maps-places",
        summary=(
            f"Found {len(options)} real {budget_label.lower()} hotel options across {city_list or area}. "
            "Ratings come from Google Places; prices/links use Google Hotels when available."
        ),
        options=options,
        next_step="Tap a hotel to open it on Google Maps, then confirm live availability with the property's preferred booking site.",
    )


def _serpapi_google_hotels(request: HotelSearchRequest, destination: str, area: str, api_key: str | None) -> list[dict]:
    if not api_key:
        return []
    query = " ".join(part for part in [_hotel_query_prefix(request.stay_type, request.budget), area or destination, "hotel"] if part)
    params = {
        "engine": "google_hotels",
        "q": query,
        "check_in_date": request.check_in,
        "check_out_date": request.check_out,
        "adults": max(1, request.travelers),
        "currency": "USD",
        "hl": "en",
        "gl": "us",
        "api_key": api_key,
    }
    params = {key: value for key, value in params.items() if value not in (None, "")}
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get("https://serpapi.com/search.json", params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return []
    if payload.get("error"):
        return []
    properties = payload.get("properties") or payload.get("hotel_results") or []
    results: list[dict] = []
    for item in properties[:8]:
        name = str(item.get("name") or item.get("title") or "").strip()
        if not name:
            continue
        rate = item.get("rate_per_night") or item.get("extracted_price") or {}
        total = item.get("total_rate") or {}
        results.append({
            "identity": _identity(name),
            "name": name,
            "link": item.get("link") or item.get("serpapi_property_details_link") or _google_hotels_url(name, area, request.check_in, request.check_out),
            "price": _extract_price(rate) or _extract_price(total) or _extract_price(item),
            "rating": item.get("overall_rating") or item.get("rating"),
            "reviews": item.get("reviews") or item.get("reviews_count"),
            "amenities": item.get("amenities") or [],
        })
    return results


def _serpapi_only_response(
    request: HotelSearchRequest,
    destination: str,
    area: str,
    nightly: int,
    nights: int,
    matches: list[dict],
) -> HotelSearchResponse:
    options = []
    for match in matches[:4]:
        price = _serpapi_price(match) or nightly
        rating = float(match.get("rating") or 0.0)
        reviews = int(float(match.get("reviews") or 0))
        options.append(
            HotelOption(
                id=_slug(match["name"]),
                name=match["name"],
                area=area or destination,
                rating=rating,
                review_count=reviews,
                price_per_night_usd=price,
                total_estimate_usd=price * nights,
                highlights=_hotel_highlights(area, "", {}, match),
                booking_url=match.get("link") or _hotel_search_url(area or destination, request.check_in, request.check_out),
                source="serpapi-google-hotels",
            )
        )
    return HotelSearchResponse(
        mode="provider",
        provider="serpapi-google-hotels",
        summary=f"Found {len(options)} Google Hotels options in {area or destination}. Verify live rates before booking.",
        options=options,
        next_step="Pick a hotel here, then review live availability and cancellation rules on Google Hotels.",
    )


def _hotel_queries_for_city(city: str, stay_type: str, budget: str) -> list[str]:
    """Build hotel search queries targeting a specific city."""
    stay = (stay_type or "").lower()
    budget_lower = (budget or "").lower()

    if "apartment" in stay or "airbnb" in stay:
        venue = "serviced apartment"
    elif "boutique" in stay:
        venue = "boutique hotel"
    elif "resort" in stay:
        venue = "resort"
    elif "hostel" in stay or "budget" in stay:
        venue = "hostel"
    else:
        venue = "hotel"

    if "luxury" in budget_lower:
        tier = "luxury "
    elif "comfortable" in budget_lower:
        tier = "4 star "
    elif "budget" in budget_lower:
        tier = "budget "
    else:
        tier = ""

    return [
        f"best {tier}{venue} in {city}",
        f"top rated {tier}{venue} {city}",
    ]


def _hotel_query_prefix(stay_type: str, budget: str) -> str:
    stay = (stay_type or "").lower()
    budget_lower = (budget or "").lower()
    if "apartment" in stay or "airbnb" in stay:
        venue = "serviced apartment"
    elif "boutique" in stay:
        venue = "boutique hotel"
    elif "ryokan" in stay or "local" in stay:
        venue = "traditional hotel"
    elif "hostel" in stay or "cheapest" in stay or "budget" in stay:
        venue = "budget hotel"
    else:
        venue = "hotel"
    if "luxury" in budget_lower:
        return f"luxury {venue}"
    if "comfortable" in budget_lower:
        return f"4 star {venue}"
    if "budget" in budget_lower:
        return f"budget {venue}"
    return venue


def _find_serpapi_match(name: str, matches: list[dict]) -> dict | None:
    identity = _identity(name)
    if not identity:
        return None
    for match in matches:
        other = match.get("identity") or _identity(match.get("name") or "")
        if other and (identity in other or other in identity):
            return match
    return None


def _extract_price(value: object) -> int | None:
    if isinstance(value, (int, float)):
        return round(float(value))
    if isinstance(value, dict):
        for key in ("extracted_lowest", "extracted_price", "lowest", "price", "value"):
            parsed = _extract_price(value.get(key))
            if parsed:
                return parsed
        return None
    text = str(value or "")
    match = re.search(r"\$?\s*([0-9][0-9,]*(?:\.\d+)?)", text)
    if not match:
        return None
    return round(float(match.group(1).replace(",", "")))


def _serpapi_price(match: dict | None) -> int | None:
    if not match:
        return None
    return _extract_price(match.get("price"))


def _hotel_highlights(area: str, review_snippet: str, details: dict, serpapi_match: dict | None) -> list[str]:
    highlights: list[str] = []
    if area:
        highlights.append(_short_area_tag(area))
    amenities = [str(item) for item in (serpapi_match or {}).get("amenities", []) if item]
    if amenities:
        highlights.extend(amenities[:2])
    if review_snippet:
        highlights.append(_short_review_tag(review_snippet))
    elif details.get("rating"):
        highlights.append("Well reviewed")
    highlights.append("Verify live rate")
    clean: list[str] = []
    for item in highlights:
        text = str(item or "").strip()
        if text and text not in clean:
            clean.append(text[:34])
    return clean[:3]


def _short_area_tag(area: str) -> str:
    text = area.split(",")[0].strip()
    if not text:
        return "Good base"
    if "station" in text.lower() or "transit" in text.lower():
        return "Near transit"
    if "center" in text.lower() or "central" in text.lower():
        return "Central base"
    return text[:28]


def _short_review_tag(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return "Well reviewed"
    first = re.split(r"[.!?。]", cleaned)[0].strip()
    return first[:34]


def _price_modifier_from_details(details: dict, hit: dict, budget: str) -> float:
    """Bias the estimated nightly rate based on Google's price_level (1-4)."""
    # price_level isn't reliably returned for hotels by Maps API, so fall back
    # to small per-result variation so the 4 cards don't all show the same price.
    base = 1.0
    rating = float(details.get("rating") or hit.get("rating") or 4.0)
    if rating >= 4.7:
        base = 1.15
    elif rating >= 4.4:
        base = 1.0
    else:
        base = 0.88
    # Tiny jitter so cards differ visibly
    return base + random.uniform(-0.05, 0.05)



def _curated_japan_hotels(destination: str, area: str, nightly: int, nights: int, check_in: str, check_out: str) -> HotelSearchResponse | None:
    city = _known_japan_city(area) or _known_japan_city(destination)
    curated = {
        "Tokyo": [
            ("Hotel Metropolitan Tokyo Marunouchi", "Marunouchi / Tokyo Station", 4.4, 1700, 240, ["Reliable full-service hotel", "Excellent Tokyo Station logistics", "Good arrival or final-night base"]),
            ("Nohga Hotel Ueno Tokyo", "Ueno", 4.5, 1200, 185, ["Design-forward neighborhood stay", "Easy transit across Tokyo", "Strong value for first-time visitors"]),
        ],
        "Hakone": [
            ("Hakone Yutowa", "Gora", 4.3, 900, 260, ["Modern onsen hotel", "Good value in Gora", "Easy one-night Hakone base"]),
            ("Hotel Okada", "Hakone-Yumoto", 4.1, 2100, 230, ["Classic onsen stay", "Convenient Hakone-Yumoto access", "Ryokan-style dinner options"]),
        ],
        "Kyoto": [
            ("Hotel Granvia Kyoto", "Kyoto Station", 4.4, 2600, 235, ["Best Shinkansen logistics", "Reliable full-service base", "Easy for Kyoto and Nara day trips"]),
            ("Nohga Hotel Kiyomizu Kyoto", "Kiyomizu", 4.5, 950, 190, ["Design-forward local feel", "Walkable temple district", "Good moderate Kyoto pick"]),
        ],
        "Osaka": [
            ("Hotel The Flag Shinsaibashi", "Shinsaibashi", 4.6, 1800, 170, ["Strong value near Shinsaibashi", "Modern boutique feel", "Easy food-night base"]),
            ("Cross Hotel Osaka", "Namba / Dotonbori", 4.4, 2200, 210, ["Great Dotonbori access", "Reliable city hotel", "Easy late-night food option"]),
        ],
    }
    hotels = curated.get(city)
    if not hotels:
        return None

    options = []
    for name, neighborhood, rating, reviews, demo_rate, highlights in hotels:
        rate = max(50, round(demo_rate or nightly))
        options.append(
            HotelOption(
                id=_slug(name),
                name=name,
                area=neighborhood,
                rating=rating,
                review_count=reviews,
                price_per_night_usd=rate,
                total_estimate_usd=rate * nights,
                highlights=highlights,
                booking_url=_google_hotels_url(name, city, check_in, check_out),
                source="curated-japan-demo",
            )
        )

    return HotelSearchResponse(
        mode="mock",
        provider="curated-japan-demo-hotels",
        summary=(
            f"Found 2 curated respected hotel options for {city}. "
            "Rates are demo estimates; open Google Hotels to verify live availability."
        ),
        options=options,
        next_step="Pick one hotel per overnight city, then verify live availability and cancellation rules.",
    )


def _known_japan_city(value: str) -> str:
    text = str(value or "").lower()
    for city in ("Tokyo", "Hakone", "Kyoto", "Osaka"):
        if city.lower() in text:
            return city
    return ""

def _mock_hotels(destination: str, area: str, nightly: int, nights: int, check_in: str, check_out: str) -> HotelSearchResponse:
    search_url = _hotel_search_url(area, check_in, check_out)
    options = [
        HotelOption(
            id="hotel-transit-base",
            name=f"{area} Transit Base Hotel",
            area=area,
            rating=4.4,
            review_count=1280,
            price_per_night_usd=nightly,
            total_estimate_usd=nightly * nights,
            highlights=["Near transit", "Good for first-time visitors", "Easy luggage logistics"],
            booking_url=search_url,
        ),
        HotelOption(
            id="hotel-local-boutique",
            name=f"{area} Local Boutique Stay",
            area=area,
            rating=4.6,
            review_count=740,
            price_per_night_usd=round(nightly * 1.18),
            total_estimate_usd=round(nightly * 1.18) * nights,
            highlights=["Neighborhood feel", "Smaller property", "Good for food and evening walks"],
            booking_url=search_url,
        ),
        HotelOption(
            id="hotel-value-comfort",
            name=f"{destination} Value Comfort Hotel",
            area=destination,
            rating=4.2,
            review_count=2100,
            price_per_night_usd=round(nightly * 0.82),
            total_estimate_usd=round(nightly * 0.82) * nights,
            highlights=["Lower nightly rate", "Reliable chain-style stay", "Good backup option"],
            booking_url=search_url,
        ),
    ]
    return HotelSearchResponse(
        mode="mock",
        provider="mock-hotel-provider",
        summary=(
            f"I found {len(options)} hotel-style options around {area}. "
            "Ratings and prices are demo estimates until a live hotel provider is connected."
        ),
        options=options,
        next_step="Choose one option here, then verify live availability and cancellation rules on the provider site.",
    )


def _identity(value: str) -> str:
    base = (value or "").lower()
    base = re.sub(r"[^a-z0-9]+", " ", base)
    return re.sub(r"\s+", " ", base).strip()


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug or "hotel-option")[:48]


def _area_from_preference(destination: str, neighborhood: str) -> str:
    pref = str(neighborhood or "").strip()
    if not pref:
        return destination
    cleaned = (
        pref.replace("—", "-")
        .replace("Near main attractions", "central sightseeing area")
        .replace("City center - walkable", "city center")
        .replace("City center", "city center")
        .replace("Quiet residential", "quiet residential district")
        .replace("Trendy district", "trendy district")
        .replace("Beach or waterfront", "waterfront area")
        .strip()
    )
    return f"{cleaned}, {destination}" if destination.lower() not in cleaned.lower() else cleaned


def _nightly_budget(budget: str) -> int:
    text = budget.lower()
    if "luxury" in text:
        return 420
    if "comfortable" in text:
        return 260
    if "budget" in text or "hostel" in text:
        return 95
    return 170


def _hotel_search_url(area: str, check_in: str, check_out: str) -> str:
    query = " ".join(part for part in [area, check_in, check_out, "hotels"] if part)
    return f"https://www.google.com/travel/hotels?q={quote_plus(query)}"


def _google_hotels_url(hotel_name: str, area: str, check_in: str, check_out: str) -> str:
    """Open Google Hotels search for a specific hotel name.

    Google Hotels aggregates Booking.com, Expedia, Agoda, Hotels.com, etc. — the
    user lands on a price-comparison view for the exact property and can pick
    whichever booking site they prefer.
    """
    parts = [hotel_name, area]
    if check_in:
        parts.append(check_in)
    if check_out:
        parts.append(check_out)
    return f"https://www.google.com/travel/hotels?q={quote_plus(' '.join(parts))}"


def _booking_com_url(hotel_name: str) -> str:
    """Direct Booking.com search for the named hotel — alternative to Google Hotels."""
    return f"https://www.booking.com/searchresults.html?ss={quote_plus(hotel_name)}"
