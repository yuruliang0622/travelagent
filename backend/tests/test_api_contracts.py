from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from app.config import Settings
from app.data.mock_data import MOCK_ITINERARY
from app.main import app
from app.models import BookingChecklistPatch, BookingStatus, ItinerarySegment, MapPlace, PlaceCategory
from app.storage.repository import TripRepository, repository


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


def test_list_trips_returns_saved_trip_summary() -> None:
    # The app starts with no seed trips (intentional, for the demo's blank
    # start), so save one first, assert it shows up, then clean it up to avoid
    # leaking test data into other tests.
    repository.save_trip(MOCK_ITINERARY)
    try:
        response = client.get("/api/trips")

        assert response.status_code == 200
        payload = response.json()
        assert payload["mode"] in {"memory", "mongodb-atlas"}
        assert payload["trips"]
        assert {
            "id": "japan-first-demo",
            "title": "Japan First-Timer Food + Culture Route",
            "dates": "Jul 15 - Jul 21, 2026",
            "destination_pack_id": "japan",
        } in payload["trips"]
    finally:
        repository.delete_trip(MOCK_ITINERARY.id)



def test_saved_trip_preserves_place_details() -> None:
    trip = MOCK_ITINERARY.model_copy(update={"id": "pytest-place-details"})
    place_details = {
        "yanaka": {
            "rating": 4.7,
            "user_ratings_total": 1234,
            "opening_hours": ["Monday: 9:00 AM – 5:00 PM"],
            "website": "https://example.com/yanaka",
        }
    }

    save_response = client.post(
        "/api/trips",
        json={"itinerary": trip.model_dump(mode="json"), "place_details": place_details},
    )

    try:
        assert save_response.status_code == 201
        assert save_response.json()["place_details"] == place_details

        get_response = client.get("/api/trips/pytest-place-details")
        assert get_response.status_code == 200
        payload = get_response.json()
        assert payload["itinerary"]["id"] == "pytest-place-details"
        assert payload["place_details"] == place_details
    finally:
        repository.delete_trip("pytest-place-details")


def test_plain_itinerary_save_still_loads_as_saved_trip() -> None:
    trip = MOCK_ITINERARY.model_copy(update={"id": "pytest-plain-itinerary"})

    save_response = client.post("/api/trips", json=trip.model_dump(mode="json"))

    try:
        assert save_response.status_code == 201
        assert save_response.json()["trip"]["id"] == "pytest-plain-itinerary"
        assert save_response.json()["place_details"] == {}

        get_response = client.get("/api/trips/pytest-plain-itinerary")
        assert get_response.status_code == 200
        payload = get_response.json()
        assert payload["itinerary"]["id"] == "pytest-plain-itinerary"
        assert payload["place_details"] == {}
    finally:
        repository.delete_trip("pytest-plain-itinerary")

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
    repository.save_trip(MOCK_ITINERARY)
    try:
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
    finally:
        repository.delete_trip(MOCK_ITINERARY.id)


def test_memory_search_validates_limit_bounds() -> None:
    response = client.post(
        "/api/memory/search",
        json={"query": "japan", "limit": 21},
    )

    assert response.status_code == 422


def test_repository_uses_memory_when_mongodb_uri_is_missing() -> None:
    repo = TripRepository(settings=Settings(mongodb_uri=None))

    assert repo.persistence_mode == "memory"
    repo.save_trip(MOCK_ITINERARY)
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
    repo.save_trip(MOCK_ITINERARY)
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
    repo.save_trip(MOCK_ITINERARY)
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
    repo.save_trip(MOCK_ITINERARY)

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



def test_resolve_place_details_uses_google_place_id_without_polluting_segment_ids(monkeypatch) -> None:
    from app.agent.planner import _resolve_place_details

    local_id = "yasaka-shrine"
    google_id = "ChIJ-google-yasaka"
    place = MapPlace(
        id=local_id,
        name="Yasaka Shrine",
        category=PlaceCategory.attraction,
        neighborhood="Kyoto",
        lat=35.0037,
        lng=135.7786,
        cost="$",
        duration="~1.5 hr",
        source="google-maps-places",
        why_it_fits="Popular shrine",
        google_maps_url="https://www.google.com/maps/place/?q=place_id:ChIJ-google-yasaka",
        google_place_id=google_id,
    )
    segment = ItinerarySegment(
        time="08:00",
        title="Yasaka Shrine",
        description="Popular shrine",
        place_ids=[local_id],
        travel_note="Walk",
        cost="$",
    )
    itinerary = MOCK_ITINERARY.model_copy(
        update={
            "id": "pytest-google-place-id",
            "places": [place],
            "days": [
                MOCK_ITINERARY.days[0].model_copy(
                    update={"segments": [segment], "place_ids": [local_id]}
                )
            ],
        }
    )

    def fake_batch(place_ids):
        assert place_ids == [google_id]
        return {google_id: {"rating": 4.6, "opening_hours": ["Monday: 9:00 AM – 5:00 PM"]}}

    monkeypatch.setattr("app.agent.planner.batch_get_place_details", fake_batch)

    details = _resolve_place_details(itinerary, [], [])

    assert segment.place_ids == [local_id]
    assert details[local_id]["rating"] == 4.6

def test_place_cache_round_trips_in_memory() -> None:
    repo = TripRepository(settings=Settings(mongodb_uri=None))

    # Miss before anything is cached
    assert repo.get_cached_places("attraction", "tokyo") is None

    places = [{"name": f"Spot {i}", "place_id": f"pid-{i}", "city": "tokyo"} for i in range(5)]
    repo.cache_places("attraction", "tokyo", places)

    # Hit — key is case-insensitive and the full pool comes back
    cached = repo.get_cached_places("attraction", "Tokyo")
    assert cached is not None
    assert {p["place_id"] for p in cached} == {p["place_id"] for p in places}

    # Different kind / city stays a miss
    assert repo.get_cached_places("restaurant", "tokyo") is None
    assert repo.get_cached_places("attraction", "kyoto") is None


def test_place_cache_respects_ttl() -> None:
    repo = TripRepository(settings=Settings(mongodb_uri=None, place_cache_ttl_days=30))
    repo.cache_places("attraction", "tokyo", [{"name": "x", "place_id": "p"}])
    assert repo.get_cached_places("attraction", "tokyo") is not None

    # Backdate the entry beyond the TTL → now treated as a miss (refetch)
    stale = (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()
    repo._place_cache["attraction:tokyo"]["fetched_at"] = stale
    assert repo.get_cached_places("attraction", "tokyo") is None


def test_place_cache_can_be_disabled() -> None:
    repo = TripRepository(settings=Settings(mongodb_uri=None, enable_place_cache=False))
    repo.cache_places("attraction", "tokyo", [{"name": "x", "place_id": "p"}])
    assert repo.get_cached_places("attraction", "tokyo") is None
