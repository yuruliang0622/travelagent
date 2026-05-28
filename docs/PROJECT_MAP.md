# Trip Agent Project Map

Use this file when you come back to the project and need to find where things live.

## Current Shape

```text
Trip Agent/
├── frontend/                 # Static React product UI
├── backend/                  # FastAPI backend and agent logic
├── docs/                     # Architecture, setup, and project notes
├── README.md                 # How to run the project
├── package.json              # Frontend static server command
├── Dockerfile.web            # Static frontend container
└── cloudbuild.yaml           # Cloud Run build/deploy config
```

## Backend Map

```text
backend/app/
├── main.py                   # FastAPI routes
├── config.py                 # Environment settings
├── models.py                 # Pydantic API/data models
├── data/                     # Mock/demo destination data
├── agent/                    # Gemini planner, prompts, parser, tools
├── integrations/             # Google Maps, embeddings, MongoDB MCP bridge
├── storage/                  # MongoDB repository and memory fallback
└── enrichment/               # Restaurant and itinerary post-processing
```

## Where To Change Things

```text
Change frontend experience       -> frontend/
Change API routes                -> backend/app/main.py
Change agent orchestration       -> backend/app/agent/planner.py
Change Gemini prompts            -> backend/app/agent/prompts.py
Change tool calling              -> backend/app/agent/tools.py
Change MongoDB persistence       -> backend/app/storage/repository.py
Change Google Maps integration   -> backend/app/integrations/maps.py
Change restaurant replacement    -> backend/app/enrichment/restaurants.py
Change mock destination data     -> backend/app/data/mock_data.py
Change shared data models        -> backend/app/models.py
Change environment variables     -> backend/app/config.py
```

## Frontend Map

```text
frontend/
├── index.html                # Browser entrypoint; loads React/Babel/CDN scripts
├── app.jsx                   # Main dashboard shell and trip state
├── agent-chat.jsx            # Chat, interview flow, plan generation, booking flow
├── direction-b.jsx           # Itinerary detail and timeline UI
├── tweaks-panel.jsx          # Palette/display controls
├── icons.jsx                 # Shared icon components
├── trip-data.js              # Static fallback trip data
└── styles.css                # Global styling
```

## Mental Model

The product currently has two active halves:

```text
frontend/  -> what the traveler sees and clicks
backend/   -> API, Gemini planning, MongoDB, Google Maps, enrichment
```

The old Next.js `src/` app is no longer the active direction. Keep evolving `frontend/` unless you intentionally decide to migrate the prototype into Vite or Next.js later.
