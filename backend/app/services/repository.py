from typing import Any

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.config import Settings, get_settings
from app.data.mock_data import DESTINATION_PACKS, MOCK_ITINERARY, PROVIDER_LIMITS
from app.models import (
    BookingChecklistItem,
    BookingChecklistPatch,
    DestinationPack,
    Itinerary,
    MapPlace,
    MemorySearchRequest,
    MemorySearchResult,
    PlaceCategory,
    ProviderLimit,
    TripListItem,
    UserProfile,
)


class TripRepository:
    """Repository backed by MongoDB Atlas with an in-memory fallback."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._trips: dict[str, Itinerary] = {MOCK_ITINERARY.id: MOCK_ITINERARY}
        self._profiles: dict[str, UserProfile] = {}
        self._destination_packs: dict[str, DestinationPack] = {
            pack.id: pack for pack in DESTINATION_PACKS
        }
        self._client: MongoClient[dict[str, Any]] | None = None
        self._db: Database[dict[str, Any]] | None = None
        self._mongo_available = False
        self._mongo_error = ""

        if self._settings.mongodb_uri:
            self._connect_mongodb()

    @property
    def persistence_mode(self) -> str:
        return "mongodb-atlas" if self._mongo_available else "memory"

    @property
    def mongodb_available(self) -> bool:
        return self._mongo_available

    @property
    def mongodb_error(self) -> str:
        return self._mongo_error

    def list_trips(self) -> list[TripListItem]:
        if self._mongo_available:
            docs = self._find_many(self._trips_collection())
            if docs is not None:
                return [
                    TripListItem(
                        id=doc["id"],
                        title=doc["title"],
                        dates=doc["dates"],
                        destination_pack_id=doc["destination_pack_id"],
                    )
                    for doc in docs
                ]

        return [
            TripListItem(
                id=trip.id,
                title=trip.title,
                dates=trip.dates,
                destination_pack_id=trip.destination_pack_id,
            )
            for trip in self._trips.values()
        ]

    def get_trip(self, trip_id: str) -> Itinerary | None:
        if self._mongo_available:
            doc = self._find_one(self._trips_collection(), trip_id)
            if doc is not None:
                trip = self._model_from_doc(Itinerary, doc)
                self._trips[trip.id] = trip
                return trip

        return self._trips.get(trip_id)

    def save_trip(self, trip: Itinerary) -> Itinerary:
        self._trips[trip.id] = trip
        if self._mongo_available:
            self._replace_one(self._trips_collection(), trip.id, self._model_to_doc(trip))
        return trip

    def save_profile(self, profile: UserProfile) -> UserProfile:
        self._profiles[profile.id] = profile
        if self._mongo_available:
            self._replace_one(
                self._profiles_collection(),
                profile.id,
                self._model_to_doc(profile),
            )
        return profile

    def get_profile(self, profile_id: str) -> UserProfile | None:
        if self._mongo_available:
            doc = self._find_one(self._profiles_collection(), profile_id)
            if doc is not None:
                profile = self._model_from_doc(UserProfile, doc)
                self._profiles[profile.id] = profile
                return profile

        return self._profiles.get(profile_id)

    def list_destination_packs(self) -> list[DestinationPack]:
        if self._mongo_available:
            docs = self._find_many(self._destination_packs_collection())
            if docs is not None:
                packs = [self._model_from_doc(DestinationPack, doc) for doc in docs]
                self._destination_packs.update({pack.id: pack for pack in packs})
                return packs

        return list(self._destination_packs.values())

    def get_destination_pack(self, pack_id: str) -> DestinationPack | None:
        if self._mongo_available:
            doc = self._find_one(self._destination_packs_collection(), pack_id)
            if doc is not None:
                pack = self._model_from_doc(DestinationPack, doc)
                self._destination_packs[pack.id] = pack
                return pack

        return self._destination_packs.get(pack_id)

    def list_places(
        self,
        trip_id: str | None = None,
        query: str = "",
        category: PlaceCategory | None = None,
    ) -> list[MapPlace]:
        trip = self.get_trip(trip_id or MOCK_ITINERARY.id)
        if trip is None:
            return []

        normalized_query = query.strip().lower()

        def matches(place: MapPlace) -> bool:
            if category is not None and place.category != category:
                return False
            if not normalized_query:
                return True
            haystack = " ".join(
                [
                    place.name,
                    place.neighborhood,
                    place.source,
                    place.why_it_fits,
                    place.category.value,
                ],
            ).lower()
            return normalized_query in haystack

        return [place for place in trip.places if matches(place)]

    def get_booking_checklist(self, trip_id: str) -> list[BookingChecklistItem] | None:
        trip = self.get_trip(trip_id)
        if trip is None:
            return None
        return trip.booking_checklist

    def update_booking_checklist_item(
        self,
        trip_id: str,
        item_id: str,
        patch: BookingChecklistPatch,
    ) -> BookingChecklistItem | None:
        trip = self.get_trip(trip_id)
        if trip is None:
            return None

        patch_data = patch.model_dump(exclude_none=True)
        for index, item in enumerate(trip.booking_checklist):
            if item.id != item_id:
                continue

            updated_item = item.model_copy(update=patch_data)
            trip.booking_checklist[index] = updated_item
            self.save_trip(trip)
            return updated_item

        return None

    def search_memory(self, request: MemorySearchRequest) -> list[MemorySearchResult]:
        query = request.query.strip().lower()
        scopes = set(request.scopes)
        trips = self._memory_search_trips()
        pack = self.get_destination_pack(request.destination_pack_id)
        candidates: list[MemorySearchResult] = []

        if "profile" in scopes:
            profiles = self._memory_search_profiles(trips)
            for profile in profiles:
                candidates.append(
                    MemorySearchResult(
                        id=f"profile:{profile.id}",
                        scope="profile",
                        title=f"{profile.name}'s travel profile",
                        snippet=" · ".join(
                            [
                                profile.pace.value,
                                profile.budget,
                                *profile.food_preferences,
                                *profile.interests,
                                *profile.constraints,
                            ],
                        ),
                        source="user_profile",
                        score=0,
                    ),
                )

        if pack is not None and "destination" in scopes:
            candidates.append(
                MemorySearchResult(
                    id=f"destination:{pack.id}",
                    scope="destination",
                    title=f"{pack.country} destination pack",
                    snippet=" · ".join(
                        [
                            *pack.regions,
                            *pack.cultural_notes,
                            *pack.transport_notes,
                            *pack.seasonal_notes,
                        ],
                    ),
                    source="destination_pack",
                    score=0,
                ),
            )

        if "itinerary" in scopes:
            for trip in trips:
                for day in trip.days:
                    candidates.append(
                        MemorySearchResult(
                            id=f"itinerary:{trip.id}:{day.id}",
                            scope="itinerary",
                            title=day.title,
                            snippet=" ".join(segment.description for segment in day.segments),
                            source=trip.id,
                            score=0,
                        ),
                    )

        if "place" in scopes:
            for trip in trips:
                for place in trip.places:
                    candidates.append(
                        MemorySearchResult(
                            id=f"place:{place.id}",
                            scope="place",
                            title=place.name,
                            snippet=f"{place.neighborhood} · {place.category.value} · {place.why_it_fits}",
                            source=place.source,
                            score=0,
                        ),
                    )

        scored = [
            result.model_copy(update={"score": self._score(query, result)})
            for result in candidates
        ]
        return sorted(
            [result for result in scored if not query or result.score > 0],
            key=lambda result: (-result.score, result.title),
        )[: request.limit]

    def list_provider_limits(self) -> list[ProviderLimit]:
        return PROVIDER_LIMITS

    def _connect_mongodb(self) -> None:
        try:
            # MongoDB is optional for local demos, so fail fast and keep serving memory data.
            self._client = MongoClient(
                self._settings.mongodb_uri,
                serverSelectionTimeoutMS=2000,
            )
            self._client.admin.command("ping")
            self._db = self._client[self._settings.mongodb_database]
            self._mongo_available = True
            self._seed_mongodb_defaults()
        except PyMongoError as exc:
            self._mongo_available = False
            self._mongo_error = exc.__class__.__name__
            self._client = None
            self._db = None

    def _seed_mongodb_defaults(self) -> None:
        for pack in DESTINATION_PACKS:
            if self._find_one(self._destination_packs_collection(), pack.id) is None:
                if not self._mongo_available:
                    return
                self._replace_one(
                    self._destination_packs_collection(),
                    pack.id,
                    self._model_to_doc(pack),
                )

        if self._find_one(self._trips_collection(), MOCK_ITINERARY.id) is None:
            if not self._mongo_available:
                return
            self._replace_one(
                self._trips_collection(),
                MOCK_ITINERARY.id,
                self._model_to_doc(MOCK_ITINERARY),
            )

    def _trips_collection(self) -> Collection[dict[str, Any]]:
        return self._collection(self._settings.mongodb_trips_collection)

    def _profiles_collection(self) -> Collection[dict[str, Any]]:
        return self._collection(self._settings.mongodb_profiles_collection)

    def _destination_packs_collection(self) -> Collection[dict[str, Any]]:
        return self._collection(self._settings.mongodb_destination_packs_collection)

    def _collection(self, name: str) -> Collection[dict[str, Any]]:
        if self._db is None:
            raise RuntimeError("MongoDB is not connected")
        return self._db[name]

    def _find_one(
        self,
        collection: Collection[dict[str, Any]],
        doc_id: str,
    ) -> dict[str, Any] | None:
        try:
            return collection.find_one({"_id": doc_id})
        except PyMongoError as exc:
            self._disable_mongodb(exc)
            return None

    def _find_many(
        self,
        collection: Collection[dict[str, Any]],
    ) -> list[dict[str, Any]] | None:
        try:
            return list(collection.find({}))
        except PyMongoError as exc:
            self._disable_mongodb(exc)
            return None

    def _replace_one(
        self,
        collection: Collection[dict[str, Any]],
        doc_id: str,
        doc: dict[str, Any],
    ) -> None:
        try:
            collection.replace_one({"_id": doc_id}, doc, upsert=True)
        except PyMongoError as exc:
            self._disable_mongodb(exc)

    def _disable_mongodb(self, exc: PyMongoError) -> None:
        self._mongo_available = False
        self._mongo_error = exc.__class__.__name__

    def _model_to_doc(self, model: Any) -> dict[str, Any]:
        doc = model.model_dump(mode="json")
        doc["_id"] = doc["id"]
        return doc

    def _model_from_doc(self, model_type: Any, doc: dict[str, Any]) -> Any:
        clean_doc = dict(doc)
        clean_doc.pop("_id", None)
        return model_type.model_validate(clean_doc)

    def _memory_search_trips(self) -> list[Itinerary]:
        if self._mongo_available:
            docs = self._find_many(self._trips_collection())
            if docs is not None:
                trips = [self._model_from_doc(Itinerary, doc) for doc in docs]
                self._trips.update({trip.id: trip for trip in trips})
                return trips

        return list(self._trips.values())

    def _memory_search_profiles(self, trips: list[Itinerary]) -> list[UserProfile]:
        profiles = {profile.id: profile for profile in self._profiles.values()}
        for trip in trips:
            profiles.setdefault(trip.profile.id, trip.profile)

        if self._mongo_available:
            docs = self._find_many(self._profiles_collection())
            if docs is not None:
                for doc in docs:
                    profile = self._model_from_doc(UserProfile, doc)
                    profiles[profile.id] = profile
                    self._profiles[profile.id] = profile

        return list(profiles.values())

    def _score(self, query: str, result: MemorySearchResult) -> float:
        if not query:
            return 1

        haystack = f"{result.title} {result.snippet} {result.source}".lower()
        terms = [term for term in query.split() if term]
        if query in haystack:
            return 1

        matches = sum(1 for term in terms if term in haystack)
        if matches == 0:
            return 0
        return round(matches / len(terms), 2)


repository = TripRepository()
