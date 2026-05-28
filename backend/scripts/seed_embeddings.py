"""One-shot script to generate and store embeddings for destination packs in MongoDB Atlas.

Usage:
    cd backend
    source .venv/bin/activate
    python scripts/seed_embeddings.py

Requires MONGODB_URI and GOOGLE_CLOUD_PROJECT in backend/.env.
Run this once to enable MongoDB Atlas Vector Search in the app.
"""

import sys
import os

# Allow running from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import get_settings
from app.data.mock_data import DESTINATION_PACKS
from app.integrations.embeddings import embed_text
from pymongo import MongoClient
from pymongo.errors import PyMongoError


def pack_to_text(pack) -> str:
    """Build a single text string from a destination pack for embedding."""
    parts = [
        f"Country: {pack.country}",
        f"Regions: {', '.join(pack.regions)}",
        "Cultural notes: " + " | ".join(pack.cultural_notes),
        "Transport notes: " + " | ".join(pack.transport_notes),
        "Seasonal notes: " + " | ".join(pack.seasonal_notes),
    ]
    return "\n".join(parts)


def main():
    settings = get_settings()

    if not settings.mongodb_uri:
        print("ERROR: MONGODB_URI is not set in .env")
        sys.exit(1)

    if not settings.google_cloud_project:
        print("ERROR: GOOGLE_CLOUD_PROJECT is not set in .env")
        sys.exit(1)

    print(f"Connecting to MongoDB Atlas at {settings.mongodb_database}...")
    try:
        client: MongoClient = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        db = client[settings.mongodb_database]
        collection = db[settings.mongodb_destination_packs_collection]
        print("Connected.\n")
    except PyMongoError as e:
        print(f"ERROR: MongoDB connection failed: {e}")
        sys.exit(1)

    for pack in DESTINATION_PACKS:
        print(f"Embedding destination pack: {pack.country} ({pack.id})")
        text = pack_to_text(pack)
        vector = embed_text(text)

        if not vector:
            print(f"  WARNING: embedding failed for {pack.id}, skipping.")
            continue

        print(f"  Embedding generated ({len(vector)} dims). Upserting to Atlas...")
        doc = pack.model_dump(mode="json")
        doc["_id"] = doc["id"]
        doc["content_embedding"] = vector
        doc["embedding_text"] = text

        try:
            collection.replace_one({"_id": doc["_id"]}, doc, upsert=True)
            print(f"  Done: {pack.country}")
        except PyMongoError as e:
            print(f"  ERROR writing {pack.id}: {e}")

    print(
        "\nAll packs seeded. Next step: create a vector search index in the MongoDB Atlas UI.\n"
        "  Collection: destination_packs\n"
        "  Index name: trip_agent_vector_index\n"
        "  Field: content_embedding\n"
        "  Dimensions: 768\n"
        "  Similarity: cosine\n"
    )
    client.close()


if __name__ == "__main__":
    main()
