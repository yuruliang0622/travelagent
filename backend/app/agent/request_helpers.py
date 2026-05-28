import re

from app.data.mock_data import DESTINATION_PACKS
from app.models import DestinationPack, PlanTripRequest


def destination_for_request(request: PlanTripRequest) -> str:
    destination = request.destination.strip()
    if destination:
        return _sanitize_destination(destination)
    match = re.search(r"(?:in|to|for)\s+([A-Z][A-Za-z .,'-]+)", request.prompt)
    if match:
        return match.group(1).strip(" .,")
    return "Japan"


def _sanitize_destination(destination: str) -> str:
    """Strip UI demo/presentation suffixes like 'curated demo', 'preview'."""
    import re

    for suffix in [r"\bcurated\s+demo\b", r"\bpreview\b"]:
        destination = re.sub(suffix, "", destination, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", destination).strip(" ,-") or destination


def prompt_for_request(request: PlanTripRequest) -> str:
    if request.prompt.strip():
        return request.prompt.strip()
    destination = destination_for_request(request)
    days = request.days or 5
    return f"Plan a {days}-day trip to {destination}."


def days_from_prompt(prompt: str) -> int | None:
    match = re.search(r"(\d{1,2})\s*(?:day|days)", prompt.lower())
    if not match:
        return None
    value = int(match.group(1))
    return value if 1 <= value <= 30 else None


def dates_for_request(request: PlanTripRequest, days: int) -> str:
    # If a flight is selected, anchor dates to arrival (not departure).
    # For transpacific routes the arrival date is a different calendar day.
    arrival_date = _arrival_date_from_flight(request)
    if arrival_date:
        end_date = request.end_date or ""
        if end_date:
            return f"Arrival (Day 1): {arrival_date} — End: {end_date} ({days} days in destination)"
        return f"Arrival (Day 1): {arrival_date}; {days} days in destination"
    if request.start_date and request.end_date:
        return f"{request.start_date} - {request.end_date}"
    if request.start_date:
        return f"Starts {request.start_date}; {days} days"
    return f"Flexible dates; {days} days"


def _arrival_date_from_flight(request: PlanTripRequest) -> str:
    """Extract the destination arrival date from selected_flight.arrive_time."""
    profile = request.profile
    if not profile or not profile.selected_flight:
        return ""
    arrive_time = profile.selected_flight.get("arrive_time") or ""
    if not arrive_time:
        return ""
    # arrive_time may be "2024-12-16T15:30:00", "2024-12-16 15:30", or just "2024-12-16"
    date_match = re.match(r"(\d{4}-\d{2}-\d{2})", str(arrive_time).strip())
    return date_match.group(1) if date_match else ""


def destination_pack_for_request(request: PlanTripRequest) -> DestinationPack:
    destination = destination_for_request(request)
    dest_lower = destination.lower()

    if request.destination_pack_id:
        for pack in DESTINATION_PACKS:
            if pack.id == request.destination_pack_id:
                return pack

    for pack in DESTINATION_PACKS:
        if pack.country.lower() in dest_lower or dest_lower in pack.country.lower():
            return pack
        for region in pack.regions:
            if region.lower() in dest_lower:
                return pack

    regions = [part.strip() for part in re.split(r",|/|->|→", destination) if part.strip()]
    country = destination.split(",")[-1].strip() if "," in destination else destination
    return DestinationPack(
        id=slug(destination),
        country=country or destination,
        launch_status="planned",
        regions=regions[:6] or [destination],
        cultural_notes=["Use local etiquette and neighborhood context in planning."],
        transport_notes=["Validate route timing with live maps before booking."],
        seasonal_notes=["Check weather and major holidays before finalizing."],
    )


def slug(value: str) -> str:
    generated = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return generated or "global-destination"


def day_allocation_from_prompt(prompt: str, days: int | None = None) -> str:
    """Extract day-by-day city allocation from free-text prompt.

    Matches patterns like:
      D1 Tokyo, D2 Kyoto, D3 Kyoto
      D1: Tokyo, D2: Kyoto
      Day 1 Tokyo, Day 2 Kyoto
      day1 tokyo day2 kyoto
    """
    if not prompt:
        return ""
    text = prompt.replace("\n", " ").replace("\r", " ")
    pattern = r"(?:D(?:ay)?\s*(\d{1,2})\s*:?\s*([A-Za-z][A-Za-z\s.\'-]+?))(?=\s*(?:,|and|D(?:ay)?\s*\d|$))"
    matches = re.findall(pattern, text, re.IGNORECASE)
    if not matches:
        return ""
    parts = [f"D{num}: {city.strip().strip(',').strip()}" for num, city in matches]
    if days and len(parts) < days:
        return ""
    if len(parts) <= 1:
        return ""
    return ", ".join(parts)
