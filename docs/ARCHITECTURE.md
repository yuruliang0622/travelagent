# Trip Agent Architecture

## MVP Decision

Use the `frontend/` product UI, a FastAPI backend on Cloud Run, Gemini through Vertex AI / Google Cloud Agent Builder for planning, MongoDB Atlas for app data and vector search, the MongoDB MCP server for the partner-track requirement, Google Maps Platform for place and route validation, and Secret Manager for credentials.

## Runtime Shape

- `frontend/`: canonical product UI direction for itinerary presentation, map layout, chat interaction, and visual style.
- `web`: Next.js App Router UI for prompt input, itinerary review, map pins, booking checklist, and saved trip previews.
- `api`: FastAPI service for planning, persistence, health checks, and travel validation contracts.
- `agent`: Google Cloud Agent Builder / Gemini agent that plans, calls MongoDB MCP tools, and keeps the user in control.
- `tools`: MongoDB MCP server for database, aggregation, and vector-search actions; app-level wrappers for Places and Routes validation.

Future frontend work should migrate or wire the `frontend/` experience into the deployed Next.js app rather than extending the older dashboard design.

## Data

- MongoDB Atlas collections: `users`, `trips`, `destinationPacks`, `chatSessions`, `toolRuns`.
- Japan launches as the only active destination pack.
- MongoDB Atlas Vector Search indexes destination-pack chunks, saved user preferences, and prior trip memory.

## AI Flow

1. Frontend sends prompt, dates, preferences, and optional profile to `/api/agent/plan`.
2. Agent Builder / backend uses MongoDB MCP to retrieve profile, Japan destination-pack chunks, and relevant trip memory from MongoDB Atlas.
3. Gemini drafts structured itinerary JSON.
4. Tool layer validates places, rough travel time, weather, and budget notes.
5. Backend returns itinerary plus assumptions and approval-based booking tasks.
6. User saves the approved trip through MongoDB MCP / MongoDB Atlas.

## Deployment

- Build `Dockerfile.web` and `backend/Dockerfile`.
- Store images in Artifact Registry.
- Deploy `trip-agent-web` and `trip-agent-api` to Cloud Run.
- Inject server secrets from Secret Manager.
- Configure the MongoDB MCP server with the Atlas connection string for the selected partner track.
- Restrict browser Maps key by domain; keep server Maps key private.

## Future Upgrade Points

- ADK only if the agent becomes complex enough to need explicit planner/reviewer subagents.
- Cloud Tasks for background itinerary validation.
- Additional partner MCP tools only after the MongoDB track story is solid.
