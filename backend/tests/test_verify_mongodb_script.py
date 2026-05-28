from pymongo.errors import ServerSelectionTimeoutError

from app.config import Settings
from scripts.verify_mongodb import PROBE_COLLECTION, verify_mongodb


class FakeAdmin:
    def command(self, _: str) -> dict[str, int]:
        return {"ok": 1}


class FakeCollection:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, object]] = {}
        self.deleted_ids: list[str] = []

    def replace_one(
        self,
        query: dict[str, str],
        doc: dict[str, object],
        upsert: bool = False,
    ) -> None:
        self.docs[query["_id"]] = dict(doc)

    def find_one(self, query: dict[str, str]) -> dict[str, object] | None:
        doc = self.docs.get(query["_id"])
        return dict(doc) if doc is not None else None

    def delete_one(self, query: dict[str, str]) -> None:
        self.deleted_ids.append(query["_id"])
        self.docs.pop(query["_id"], None)


class FakeDatabase:
    def __init__(self, collection: FakeCollection) -> None:
        self.collection = collection

    def __getitem__(self, name: str) -> FakeCollection:
        assert name == PROBE_COLLECTION
        return self.collection


class FakeMongoClient:
    admin = FakeAdmin()
    collection = FakeCollection()
    closed = False

    def __init__(self, *args, **kwargs) -> None:
        pass

    def __getitem__(self, name: str) -> FakeDatabase:
        assert name == "trip_agent"
        return FakeDatabase(self.collection)

    def close(self) -> None:
        self.closed = True


def test_verify_mongodb_reports_memory_when_uri_missing() -> None:
    result = verify_mongodb(settings=Settings(mongodb_uri=None))

    assert result == {
        "mongodb_configured": False,
        "mongodb_available": False,
        "persistence": "memory",
        "database": "trip_agent",
        "probe_collection": PROBE_COLLECTION,
        "ping": "skipped",
        "write": "skipped",
        "read": "skipped",
        "delete": "skipped",
        "error": None,
    }


def test_verify_mongodb_checks_ping_write_read_delete() -> None:
    FakeMongoClient.collection = FakeCollection()

    result = verify_mongodb(
        settings=Settings(mongodb_uri="mongodb://working.test"),
        client_factory=FakeMongoClient,
    )

    assert result["mongodb_configured"] is True
    assert result["mongodb_available"] is True
    assert result["persistence"] == "mongodb-atlas"
    assert result["ping"] == "passed"
    assert result["write"] == "passed"
    assert result["read"] == "passed"
    assert result["delete"] == "passed"
    assert result["error"] is None
    assert FakeMongoClient.collection.docs == {}
    assert FakeMongoClient.collection.deleted_ids


def test_verify_mongodb_reports_sanitized_connection_error() -> None:
    class FailingAdmin:
        def command(self, _: str) -> None:
            raise ServerSelectionTimeoutError("secret-bearing connection detail")

    class FailingMongoClient:
        admin = FailingAdmin()
        closed = False

        def __init__(self, *args, **kwargs) -> None:
            pass

        def close(self) -> None:
            self.closed = True

    result = verify_mongodb(
        settings=Settings(mongodb_uri="mongodb://user:password@example.invalid"),
        client_factory=FailingMongoClient,
    )

    assert result["mongodb_configured"] is True
    assert result["mongodb_available"] is False
    assert result["persistence"] == "memory"
    assert result["ping"] == "skipped"
    assert result["error"] == "ServerSelectionTimeoutError"
    assert "password" not in str(result).lower()
    assert "example.invalid" not in str(result)
