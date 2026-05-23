from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from app.config import Settings
from app.main import app
from app.models import BookingChecklistPatch, BookingStatus
from app.services.repository import TripRepository


client = TestClient(app)


def test_health_reports_mock_backend_status() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["planner"] == "mock"
    assert payload["persistence"] in {"memory", "mongodb-atlas"}
    assert "mongodb_available" in payload
    assert "gemini_model" in payload


def test_plan_trip_returns_mock_itinerary_for_prompt() -> None:
    response = client.post(
        "/api/agent/plan",
        json={"prompt": "Plan 7 days in Japan with food and culture."},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "mock"
    assert payload["prompt"] == "Plan 7 days in Japan with food and culture."
    assert payload["destination_pack"]["id"] == "japan"
    assert payload["itinerary"]["destination_pack_id"] == "japan"
    assert payload["memory_used"] is False
    assert payload["next_integrations"]


def test_plan_trip_uses_profile_memory_consent() -> None:
    response = client.post(
        "/api/agent/plan",
        json={
            "prompt": "Build a calmer Tokyo itinerary.",
            "profile": {
                "id": "traveler-test",
                "name": "Test Traveler",
                "memory_consent": True,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["memory_used"] is True
    assert payload["itinerary"]["profile"]["id"] == "traveler-test"
    assert payload["itinerary"]["profile"]["name"] == "Test Traveler"


def test_list_trips_returns_seed_trip_summary() -> None:
    response = client.get("/api/trips")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] in {"memory", "mongodb-atlas"}
    assert payload["trips"]
    assert {
        "id": "japan-first-demo",
        "title": "Japan First-Timer Food + Culture Route",
        "dates": "Oct 12 - Oct 18, 2026",
        "destination_pack_id": "japan",
    } in payload["trips"]


def test_profiles_can_be_saved_and_read_back() -> None:
    profile = {
        "id": "pytest-profile",
        "name": "Pytest Traveler",
        "email": "pytest@example.com",
        "home_airport": "SFO",
        "travelers": 2,
        "memory_consent": True,
    }

    save_response = client.post("/api/profiles", json=profile)
    assert save_response.status_code == 201
    assert save_response.json()["id"] == "pytest-profile"

    get_response = client.get("/api/profiles/pytest-profile")
    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["id"] == "pytest-profile"
    assert payload["name"] == "Pytest Traveler"
    assert payload["travelers"] == 2


def test_profile_validation_rejects_invalid_traveler_count() -> None:
    response = client.post(
        "/api/profiles",
        json={"id": "invalid-profile", "travelers": 0},
    )

    assert response.status_code == 422


def test_memory_search_returns_scoped_lexical_results() -> None:
    response = client.post(
        "/api/memory/search",
        json={"query": "ryokan", "scopes": ["place", "itinerary"], "limit": 3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "lexical-mock"
    assert payload["next_search_layer"] == "MongoDB Atlas Vector Search"
    assert 1 <= len(payload["results"]) <= 3
    assert {result["scope"] for result in payload["results"]} <= {"place", "itinerary"}
    assert payload["results"][0]["score"] > 0


def test_memory_search_validates_limit_bounds() -> None:
    response = client.post(
        "/api/memory/search",
        json={"query": "japan", "limit": 21},
    )

    assert response.status_code == 422


def test_repository_uses_memory_when_mongodb_uri_is_missing() -> None:
    repo = TripRepository(settings=Settings(mongodb_uri=None))

    assert repo.persistence_mode == "memory"
    assert repo.get_trip("japan-first-demo") is not None
    assert repo.list_destination_packs()[0].id == "japan"


def test_repository_falls_back_when_mongodb_connection_fails(monkeypatch) -> None:
    class FailingAdmin:
        def command(self, _: str) -> None:
            raise ServerSelectionTimeoutError("unreachable test cluster")

    class FailingMongoClient:
        admin = FailingAdmin()

        def __init__(self, *args, **kwargs) -> None:
            pass

    monkeypatch.setattr(
        "app.services.repository.MongoClient",
        FailingMongoClient,
    )

    repo = TripRepository(settings=Settings(mongodb_uri="mongodb://example.invalid"))

    assert repo.persistence_mode == "memory"
    assert repo.mongodb_available is False
    assert repo.get_trip("japan-first-demo") is not None


def test_repository_updates_booking_checklist_in_fallback_memory() -> None:
    repo = TripRepository(settings=Settings(mongodb_uri=None))

    item = repo.update_booking_checklist_item(
        "japan-first-demo",
        "hakone-ryokan",
        BookingChecklistPatch(status=BookingStatus.ready),
    )

    assert item is not None
    assert item.status == BookingStatus.ready
    checklist = repo.get_booking_checklist("japan-first-demo")
    assert checklist is not None
    assert any(
        entry.id == "hakone-ryokan" and entry.status == BookingStatus.ready
        for entry in checklist
    )
