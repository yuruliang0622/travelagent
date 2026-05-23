# Trip Agent

Trip Agent is a clickable MVP for a global AI travel planner launching first with a Japan destination pack. The current milestone is a polished itinerary dashboard plus a Rapid Agent hackathon-ready backend skeleton for Gemini, Google Cloud Agent Builder, MongoDB Atlas, MongoDB MCP, and Google Maps.

## Current Build

- Canonical frontend direction lives in `frontend/`: itinerary presentation, map, chat panel, palette tweaks, and Japan trip data
- Next.js App Router with TypeScript and Tailwind CSS remains the current app/API scaffold
- React Leaflet map with mock Japan itinerary pins in the existing Next dashboard
- Planner prompt, destination chips, day tabs, timeline, reminders, and booking checklist in the existing Next dashboard
- Frontend trip types for user profiles, destination packs, itineraries, map places, and booking tasks
- Mock API routes for agent planning and saved trips
- FastAPI backend skeleton with health, planning, trip persistence, MongoDB MCP tool registry, and travel validation endpoints

## Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Standalone prototype:

```bash
open frontend/index.html
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000/health](http://localhost:8000/health).

## Google Cloud Plan

- Python FastAPI on Google Cloud Run
- Gemini on Vertex AI / Google Cloud Agent Builder for itinerary generation and agent orchestration
- MongoDB Atlas for users, destination packs, saved trips, chat sessions, and trip preferences
- MongoDB Atlas Vector Search for destination-pack retrieval and user memory
- Google Maps Platform for Places and route validation
- MongoDB MCP server as the required partner-track integration
- Secret Manager for API keys and runtime configuration

Real booking is intentionally deferred. The v1 agent prepares booking actions for user approval and hands off to provider links.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the implementation plan and [docs/SECRETS.md](docs/SECRETS.md) for environment setup.
