from app.models import PlanTripRequest
from app.agent.request_helpers import destination_for_request


def route_skeleton_for_request(request: PlanTripRequest) -> str:
    """Return soft route guardrails without prescribing day-by-day cities."""
    destination = destination_for_request(request).lower()
    if "japan" not in destination:
        return ""
    return (
        "\nROUTE GUIDANCE (soft guardrails; Route Architect chooses the actual day-by-day route):\n"
        "  Prefer practical city order, realistic night splits, and minimal backtracking.\n"
        "  Respect selected flight cities, airports, dates, and times when available; do not invent airport transfers or gateway nights.\n"
        "  Tokyo, Kyoto, and Osaka are common first-time Japan anchors, but include Hakone, Fuji, Nara, Uji, or other side trips only when timing truly supports them.\n"
        "  If onsen, ryokan, wellness, or hot springs are requested, include a fitting experience only if it works with the chosen route.\n"
        "  Food is secondary: mention local specialties briefly, but do not let restaurants dominate the day.\n"
    )
