from urllib.parse import quote_plus

import httpx

from app.config import get_settings
from app.models import FlightOption, FlightSearchRequest, FlightSearchResponse


def search_flight_options(request: FlightSearchRequest) -> FlightSearchResponse:
    """Return selectable flight options.

    Uses SerpAPI Google Flights when configured. Falls back to mock-style
    options so the demo remains usable if the provider has no quota/results.
    """
    settings = get_settings()
    if settings.enable_live_flights and settings.serpapi_api_key:
        try:
            return _search_serpapi_google_flights(request, settings.serpapi_api_key)
        except Exception:
            # Keep the demo usable if the provider key/quota/route fails.
            pass

    return _mock_flight_options(request)


def _search_serpapi_google_flights(request: FlightSearchRequest, api_key: str) -> FlightSearchResponse:
    origin = _clean_airport(request.origin) or "SFO"
    destination = _destination_iata(request.destination)
    if not request.departure_date or not request.return_date:
        raise ValueError("SerpAPI Google Flights requires departure and return dates")

    params = {
        "engine": "google_flights",
        "departure_id": origin,
        "arrival_id": destination,
        "outbound_date": request.departure_date,
        "return_date": request.return_date,
        "currency": "USD",
        "hl": "en",
        "gl": "us",
        "type": "1",
        "api_key": api_key,
    }
    with httpx.Client(timeout=12.0) as client:
        response = client.get("https://serpapi.com/search.json", params=params)
        response.raise_for_status()
        payload = response.json()

    if payload.get("error"):
        raise ValueError(str(payload["error"]))

    raw_options = (payload.get("best_flights") or []) + (payload.get("other_flights") or [])
    options = [_serpapi_option(item, index, request, origin, destination, payload) for index, item in enumerate(raw_options[:3], start=1)]
    options = [option for option in options if option]
    if not options:
        raise ValueError("SerpAPI returned no flight options")

    return FlightSearchResponse(
        mode="provider",
        provider="serpapi-google-flights",
        summary=(
            f"Here are {len(options)} flights from {origin} to {destination}:"
        ),
        options=options,
        next_step="Pick one flight option here, then verify live fare and complete purchase on the provider site.",
    )


def _serpapi_option(item: dict, index: int, request: FlightSearchRequest, origin: str, destination: str, payload: dict) -> FlightOption | None:
    flights = item.get("flights") or []
    if not flights:
        return None
    first = flights[0]
    last = flights[-1]
    airline_names = [str(flight.get("airline", "")).strip() for flight in flights if flight.get("airline")]
    flight_numbers = [str(flight.get("flight_number", "")).strip() for flight in flights if flight.get("flight_number")]
    price = item.get("price") or 0
    booking_url = (payload.get("search_metadata") or {}).get("google_flights_url") or _flight_search_url(origin, destination, request.departure_date, request.return_date)

    return FlightOption(
        id=f"serpapi-flight-{index}",
        airline=" / ".join(dict.fromkeys(airline_names)) or "Google Flights option",
        flight_numbers=flight_numbers,
        origin=origin,
        destination=destination,
        depart_time=_airport_time(first.get("departure_airport") or {}),
        arrive_time=_airport_time(last.get("arrival_airport") or {}),
        duration=_minutes_to_duration(item.get("total_duration")),
        stops=max(0, len(flights) - 1),
        cabin=request.cabin or "Economy",
        price_usd=round(float(price or 0)),
        booking_url=booking_url,
        notes=_serpapi_notes(item),
        source="serpapi-google-flights",
    )


def _mock_flight_options(request: FlightSearchRequest) -> FlightSearchResponse:
    origin = _clean_airport(request.origin) or "SFO"
    destination = _demo_destination(request.destination.strip() or "destination")
    cabin = request.cabin or "Economy"
    search_url = _flight_search_url(origin, destination, request.departure_date, request.return_date)
    premium = _cabin_multiplier(cabin)
    base = _base_price(destination)

    options = [
        FlightOption(
            id="flight-best-balance",
            airline="ANA / United",
            flight_numbers=["UA 875", "NH connection"],
            origin=origin,
            destination=destination,
            depart_time=_date_label(request.departure_date, "10:45"),
            arrive_time=_date_label(_next_day(request.departure_date), "15:10"),
            duration="11h 25m",
            stops=0,
            cabin=cabin,
            price_usd=round(base * premium),
            booking_url=search_url,
            notes=["Best balance of timing and comfort", "Good first option to verify live"],
        ),
        FlightOption(
            id="flight-lowest-fare",
            airline="Air Canada / Star Alliance",
            flight_numbers=["AC 760", "AC 003"],
            origin=origin,
            destination=destination,
            depart_time=_date_label(request.departure_date, "07:30"),
            arrive_time=_date_label(_next_day(request.departure_date), "16:40"),
            duration="16h 10m",
            stops=1,
            cabin=cabin,
            price_usd=round(base * 0.86 * premium),
            booking_url=search_url,
            notes=["Usually cheaper", "One connection, check layover length"],
        ),
        FlightOption(
            id="flight-easy-return",
            airline="Japan Airlines / American",
            flight_numbers=["JL 001", "AA partner"],
            origin=origin,
            destination=destination,
            depart_time=_date_label(request.departure_date, "12:20"),
            arrive_time=_date_label(_next_day(request.departure_date), "17:35"),
            duration="11h 15m",
            stops=0,
            cabin=cabin,
            price_usd=round(base * 1.08 * premium),
            booking_url=search_url,
            notes=["Comfortable departure time", "Often strong service reviews"],
        ),
    ]

    return FlightSearchResponse(
        mode="mock",
        provider="mock-flight-provider",
        summary=(
            f"I found {len(options)} selectable flight-style options from {origin} to {destination}. "
            "Curated demo fares are estimates until a live provider key is connected."
        ),
        options=options,
        next_step="Pick one option here, then verify live fare and complete purchase on the provider site.",
    )



def _demo_destination(destination: str) -> str:
    text = str(destination or "").strip()
    if "japan" in text.lower():
        return "Tokyo (HND)"
    return text


def _next_day(date_value: str) -> str:
    if not date_value:
        return "Next day"
    try:
        from datetime import date, timedelta

        return (date.fromisoformat(date_value) + timedelta(days=1)).isoformat()
    except ValueError:
        return "Next day"

def _clean_airport(value: str) -> str:
    text = str(value or "").strip()
    if "(" in text and ")" in text:
        inside = text.split("(", 1)[1].split(")", 1)[0]
        return inside.split("/")[0].strip()
    return text


def _destination_iata(value: str) -> str:
    text = str(value or "").strip().upper()
    if len(text) == 3 and text.isalpha():
        return text
    lower = text.lower()
    mapping = {
        "japan": "NRT",
        "tokyo": "NRT",
        "osaka": "OSA",
        "paris": "PAR",
        "france": "PAR",
        "rome": "ROM",
        "italy": "ROM",
        "barcelona": "BCN",
        "london": "LON",
        "united kingdom": "LON",
        "south korea": "SEL",
        "seoul": "SEL",
    }
    for key, code in mapping.items():
        if key in lower:
            return code
    return text.split(",", 1)[0][:3].upper()


def _airport_time(airport: dict) -> str:
    name = str(airport.get("name") or airport.get("id") or "Airport")
    time = str(airport.get("time") or "")
    return f"{name} {time}".strip()


def _minutes_to_duration(value: object) -> str:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return ""
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


def _serpapi_notes(item: dict) -> list[str]:
    notes = []
    if item.get("type"):
        notes.append(str(item["type"]))
    if item.get("carbon_emissions"):
        notes.append("Emissions data available")
    notes.append("Verify fare rules before ticketing")
    return notes[:3]


def _base_price(destination: str) -> int:
    text = destination.lower()
    if any(token in text for token in ("japan", "tokyo", "kyoto", "osaka")):
        return 980
    if any(token in text for token in ("paris", "france", "italy", "europe")):
        return 760
    if any(token in text for token in ("korea", "seoul", "taiwan", "thailand")):
        return 890
    return 720


def _cabin_multiplier(cabin: str) -> float:
    text = cabin.lower()
    if "business" in text:
        return 3.2
    if "first" in text:
        return 5.0
    if "premium" in text:
        return 1.8
    return 1.0


def _date_label(date: str, time: str) -> str:
    return f"{date} {time}".strip() if date else time


def _flight_search_url(origin: str, destination: str, departure_date: str, return_date: str) -> str:
    query = " ".join(part for part in [origin, "to", destination, departure_date, return_date, "flights"] if part)
    return f"https://www.google.com/travel/flights?q={quote_plus(query)}"
