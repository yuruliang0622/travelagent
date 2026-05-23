# Trip Agent Backend

FastAPI foundation for Trip Agent. This service returns validated itinerary data, uses Gemini when enabled, and persists trips/profiles/destination packs to MongoDB Atlas when configured. If MongoDB is missing or unavailable, the repository falls back to in-memory storage so the demo still runs.

## Run Locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run tests:

```bash
pytest
```

Health check:

```bash
curl http://localhost:8000/health
```

Plan a trip:

```bash
curl -X POST http://localhost:8000/api/agent/plan \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Plan 7 days in Japan with food, culture, and one ryokan night."}'
```

## Gemini Wiring

The planner uses mock data by default. To let `/api/agent/plan` call Gemini,
create `.env` from `.env.example` and set:

```bash
GOOGLE_API_KEY=your_rotated_google_api_key
GOOGLE_CLOUD_PROJECT=travelagent-496705
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
ENABLE_LIVE_GEMINI=true
```

If the Gemini call fails or the key is missing, the API falls back to the mock
itinerary so the demo still works.

## MongoDB Atlas Persistence

MongoDB is optional for local development. To persist saved trips, profiles,
destination packs, booking checklist updates, and memory-search source data,
set these values in `.env`:

```bash
MONGODB_URI=your_rotated_mongodb_atlas_connection_string
MONGODB_DATABASE=trip_agent
MONGODB_TRIPS_COLLECTION=trips
MONGODB_PROFILES_COLLECTION=profiles
MONGODB_DESTINATION_PACKS_COLLECTION=destination_packs
MONGODB_VECTOR_INDEX=trip_agent_vector_index
```

On startup, the repository pings MongoDB. If the ping succeeds, `/health`
reports `"persistence": "mongodb-atlas"` and seeds the demo destination pack
and trip if needed. If the URI is missing or the connection fails, `/health`
reports `"persistence": "memory"` and all routes continue using the in-memory
fallback.

## API Surface

- `GET /health`
- `POST /api/agent/plan`
- `GET /api/trips`
- `GET /api/trips/{trip_id}`
- `POST /api/trips`
- `GET /api/destination-packs`
- `GET /api/destination-packs/{pack_id}`
- `GET /api/places?q=kyoto&category=culture`
- `GET /api/booking-checklist/{trip_id}`
- `PATCH /api/booking-checklist/{trip_id}/{item_id}`
- `POST /api/memory/search`
- `GET /api/provider-limits`
- `POST /api/profiles`
- `GET /api/profiles/{profile_id}`
- `GET /api/tools`

## Next Integrations

- MongoDB Atlas Vector Search embeddings for destination-pack retrieval and saved memory
- MongoDB Atlas collections for `chat_sessions` and `tool_runs`
- MongoDB MCP server for the Rapid Agent partner-track requirement
- Vertex AI Gemini / Google Cloud Agent Builder with structured itinerary JSON output
- Google Maps Places and Routes enrichment for live map/place validation
