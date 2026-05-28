#!/usr/bin/env python3
"""Safely verify MongoDB Atlas connectivity for Trip Agent.

The command prints only sanitized status. It never prints MONGODB_URI,
credentials, tokens, or raw exception messages.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from pymongo import MongoClient
from pymongo.errors import PyMongoError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings  # noqa: E402

PROBE_COLLECTION = "trip_agent_verification"


class MongoClientFactory(Protocol):
    def __call__(self, *args: Any, **kwargs: Any) -> Any: ...


def _base_result(settings: Settings) -> dict[str, Any]:
    return {
        "mongodb_configured": bool(settings.mongodb_uri),
        "mongodb_available": False,
        "persistence": "memory",
        "database": settings.mongodb_database,
        "probe_collection": PROBE_COLLECTION,
        "ping": "skipped",
        "write": "skipped",
        "read": "skipped",
        "delete": "skipped",
        "error": None,
    }


def verify_mongodb(
    settings: Settings | None = None,
    client_factory: MongoClientFactory = MongoClient,
) -> dict[str, Any]:
    """Run a ping plus write/read/delete probe without returning secrets."""
    settings = settings or Settings(_env_file=BACKEND_ROOT / ".env")
    result = _base_result(settings)

    if not settings.mongodb_uri:
        return result

    client = None
    probe_id = f"trip-agent-probe-{uuid4()}"

    try:
        client = client_factory(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        result["ping"] = "passed"

        collection = client[settings.mongodb_database][PROBE_COLLECTION]
        probe_doc = {
            "_id": probe_id,
            "kind": "mongodb-verification",
            "created_by": "scripts/verify_mongodb.py",
            "created_at": datetime.now(UTC),
        }

        collection.replace_one({"_id": probe_id}, probe_doc, upsert=True)
        result["write"] = "passed"

        saved = collection.find_one({"_id": probe_id})
        if saved is None or saved.get("kind") != probe_doc["kind"]:
            result["read"] = "failed"
            result["error"] = "ProbeReadMismatch"
            return result
        result["read"] = "passed"

        collection.delete_one({"_id": probe_id})
        result["delete"] = "passed"
        result["mongodb_available"] = True
        result["persistence"] = "mongodb-atlas"
        return result
    except PyMongoError as exc:
        result["error"] = exc.__class__.__name__
        return result
    finally:
        if client is not None:
            client.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify Trip Agent MongoDB Atlas persistence without printing secrets.",
    )
    parser.add_argument(
        "--require-atlas",
        action="store_true",
        help="Exit non-zero unless ping and write/read/delete all pass.",
    )
    args = parser.parse_args()

    result = verify_mongodb()
    print(json.dumps(result, indent=2, sort_keys=True))

    if args.require_atlas and result["persistence"] != "mongodb-atlas":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
