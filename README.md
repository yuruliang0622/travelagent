# Trip Agent

Trip Agent is a clickable MVP for a global AI travel planner launching first with a Japan destination pack. The current milestone is a polished itinerary dashboard plus a Rapid Agent hackathon-ready backend skeleton for Gemini, Google Cloud Agent Builder, MongoDB Atlas, MongoDB MCP, and Google Maps.

## Current Build

- Canonical frontend direction lives in `frontend/`: itinerary presentation, map, chat panel, palette tweaks, and Japan trip data
- Static React prototype served from `frontend/` with CDN React/Babel and no frontend build step
- Planner prompt, destination chips, day tabs, timeline, reminders, and booking checklist in the static frontend
- FastAPI backend skeleton with health, planning, trip persistence, MongoDB MCP tool registry, and travel validation endpoints

## Where Things Live

```text
frontend/                    Static product UI
backend/app/main.py           FastAPI routes
backend/app/agent/            Gemini planner, prompts, parsing, and tools
backend/app/integrations/     Google Maps, embeddings, MongoDB MCP bridge
backend/app/storage/          MongoDB Atlas repository and fallback memory store
backend/app/enrichment/       Itinerary post-processing, especially restaurants
backend/app/data/             Demo destination packs and mock fallback trip
backend/scripts/              One-off operational scripts
backend/tests/                API and script tests
docs/                         Architecture and secret setup notes
```

## Run Locally

Create local env files from the examples. Fill in only the values you need for
live integrations, and do not commit real secrets.

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
```

Frontend:

```bash
npm install
npm run dev -- -p 5174
```

Open [http://localhost:5174](http://localhost:5174).

Standalone prototype alternative:

```bash
python3 -m http.server 5174 --directory frontend
```

Open [http://localhost:5174](http://localhost:5174).

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000/health](http://localhost:8000/health).

## Environment Variables

Frontend:

- The static prototype currently reads the backend from `http://localhost:8000`.
- Browser-only keys should stay restricted by domain if added later.

Backend `backend/.env`:

- `APP_ENV`, `FRONTEND_ORIGIN`
- `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `GOOGLE_API_KEY`
- `MONGODB_URI`, `MONGODB_DATABASE`, collection names, `MONGODB_VECTOR_INDEX`, `MONGODB_MCP_SERVER_URL`
- `GOOGLE_MAPS_API_KEY`, `OPENWEATHER_API_KEY`
- `ENABLE_LIVE_GEMINI`, `ENABLE_LIVE_MAPS`, `ENABLE_MONGODB_MCP`

Keep real API keys, database URLs, OAuth secrets, and service credentials out of
Git. Use `.env.local`, `backend/.env`, and a deployment secret manager instead.

## Google Cloud Plan

- Python FastAPI on Google Cloud Run
- Gemini on Vertex AI / Google Cloud Agent Builder for itinerary generation and agent orchestration
- MongoDB Atlas for users, destination packs, saved trips, chat sessions, and trip preferences
- MongoDB Atlas Vector Search for destination-pack retrieval and user memory
- Google Maps Platform for Places and route validation
- MongoDB MCP server as the required partner-track integration
- Secret Manager for API keys and runtime configuration

Real booking is intentionally deferred. The v1 agent prepares booking actions for user approval and hands off to provider links.

See [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) when you need to find files, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the implementation plan, and [docs/SECRETS.md](docs/SECRETS.md) for environment setup.
