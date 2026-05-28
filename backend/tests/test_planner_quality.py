from app.models import PlanTripRequest


def test_japan_route_guidance_is_soft_not_day_template() -> None:
    from app.agent.route_skeleton import route_skeleton_for_request

    skeleton = route_skeleton_for_request(PlanTripRequest(destination="Japan", days=7))

    assert "ROUTE GUIDANCE (soft guardrails" in skeleton
    assert "Day 1:" not in skeleton
    assert "Day 7:" not in skeleton
    assert "same-airport round-trip" not in skeleton
    assert "do not invent airport transfers or gateway nights" in skeleton
