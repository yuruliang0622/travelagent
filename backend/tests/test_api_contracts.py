from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from app.config import Settings
from app.main import app
from app.models import BookingChecklistPatch, BookingStatus
from app.storage.repository import TripRepository


client = TestClient(app)


def test_health_reports_mock_backend_status() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["planner"] in {"mock", "gemini-function-calling"}
    assert payload["persistence"] in {"memory", "mongodb-atlas"}
    assert "mongodb_available" in payload
    assert "gemini_model" in payload
    assert payload["mongodb"]["mode"] == payload["persistence"]
    assert payload["mongodb"]["configured"] == payload["mongodb_configured"]
    assert payload["mongodb"]["available"] == payload["mongodb_available"]
    assert set(payload["mongodb"]["collections"]) == {
        "trips",
        "profiles",
        "destination_packs",
    }
    assert "mongodb_uri" not in payload
    assert "uri" not in payload["mongodb"]
    assert "password" not in str(payload).lower()


def test_plan_trip_returns_mock_itinerary_for_prompt(monkeypatch) -> None:
    monkeypatch.setattr("app.agent.planner.planner._try_agent_plan", lambda *args, **kwargs: None)

    response = client.post(
        "/api/agent/plan",
        json={"prompt": "Plan 7 days in Japan with food and culture."},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] in {"mock", "provider"}
    assert payload["prompt"] == "Plan 7 days in Japan with food and culture."
    assert payload["destination_pack"]["id"] == "japan"
    assert payload["itinerary"]["destination_pack_id"] == "japan"
    assert payload["memory_used"] is False
    assert payload["next_integrations"]


def test_plan_trip_accepts_global_destination_fields(monkeypatch) -> None:
    monkeypatch.setattr("app.agent.planner.planner._try_agent_plan", lambda *args, **kwargs: None)

    response = client.post(
        "/api/agent/plan",
        json={
            "prompt": "Plan a 5 day Paris food and museum trip",
            "destination": "Paris, France",
            "days": 5,
            "start_date": "2026-06-10",
            "end_date": "2026-06-15",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["prompt"] == "Plan a 5 day Paris food and museum trip"
    assert payload["mode"] == "mock"
    assert payload["destination_pack"]["id"] == "japan"
    assert payload["itinerary"]["destination_pack_id"] == "japan"


def test_plan_trip_uses_profile_memory_consent(monkeypatch) -> None:
    monkeypatch.setattr("app.agent.planner.planner._try_agent_plan", lambda *args, **kwargs: None)

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


def test_flight_booking_search_returns_selectable_options() -> None:
    response = client.post(
        "/api/booking/flights/search",
        json={
            "origin": "San Francisco (SFO)",
            "destination": "Tokyo, Japan",
            "departure_date": "2026-10-12",
            "return_date": "2026-10-18",
            "travelers": 2,
            "cabin": "Economy",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] in {"mock", "provider"}
    assert len(payload["options"]) >= 2
    assert payload["options"][0]["origin"] == "SFO"
    assert payload["options"][0]["booking_url"].startswith("https://")


def test_hotel_booking_search_returns_selectable_options() -> None:
    response = client.post(
        "/api/booking/hotels/search",
        json={
            "destination": "Tokyo, Japan",
            "nights": 6,
            "travelers": 2,
            "budget": "Moderate",
            "stay_type": "Boutique hotel",
            "neighborhood": "City center — walkable",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] in {"mock", "provider"}
    assert len(payload["options"]) >= 2
    assert payload["options"][0]["total_estimate_usd"] >= payload["options"][0]["price_per_night_usd"]
    assert payload["options"][0]["booking_url"].startswith("https://")
    assert len(payload["options"][0]["highlights"]) <= 3


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
        "app.storage.repository.MongoClient",
        FailingMongoClient,
    )

    repo = TripRepository(settings=Settings(mongodb_uri="mongodb://example.invalid"))

    assert repo.persistence_mode == "memory"
    assert repo.mongodb_available is False
    assert repo.get_trip("japan-first-demo") is not None


def test_repository_uses_mongodb_atlas_when_connection_works(monkeypatch) -> None:
    stores: dict[str, dict[str, dict[str, object]]] = {}

    class FakeAdmin:
        def command(self, _: str) -> dict[str, int]:
            return {"ok": 1}

    class FakeCollection:
        def __init__(self, name: str) -> None:
            self.store = stores.setdefault(name, {})

        def find_one(self, query: dict[str, str]) -> dict[str, object] | None:
            doc = self.store.get(query["_id"])
            return dict(doc) if doc is not None else None

        def find(self, query: dict[str, object]) -> list[dict[str, object]]:
            return [dict(doc) for doc in self.store.values()]

        def replace_one(
            self,
            query: dict[str, str],
            doc: dict[str, object],
            upsert: bool = False,
        ) -> None:
            self.store[query["_id"]] = dict(doc)

    class FakeDatabase:
        def __getitem__(self, name: str) -> FakeCollection:
            return FakeCollection(name)

    class FakeMongoClient:
        admin = FakeAdmin()

        def __init__(self, *args, **kwargs) -> None:
            pass

        def __getitem__(self, name: str) -> FakeDatabase:
            return FakeDatabase()

    monkeypatch.setattr(
        "app.storage.repository.MongoClient",
        FakeMongoClient,
    )

    repo = TripRepository(settings=Settings(mongodb_uri="mongodb://working.test"))

    assert repo.persistence_mode == "mongodb-atlas"
    assert repo.mongodb_available is True
    assert repo.mongodb_error == ""
    assert repo.get_trip("japan-first-demo") is not None

    profile = repo.save_profile(
        repo.get_trip("japan-first-demo").profile.model_copy(
            update={"id": "mongo-profile", "name": "Mongo Traveler"},
        ),
    )

    assert profile.id == "mongo-profile"
    assert stores["profiles"]["mongo-profile"]["name"] == "Mongo Traveler"
    assert repo.get_profile("mongo-profile") is not None


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
