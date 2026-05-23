# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server at http://localhost:5174/
npm run build    # production build
npm run lint     # ESLint
npx tsc --noEmit # type-check without emitting
```

No test suite is configured yet.

## Architecture

**Stack:** Next.js 16 App Router · TypeScript (strict) · Tailwind CSS 4 · React Leaflet

**Current state:** Clickable frontend MVP plus a FastAPI backend skeleton. Data is still mocked until Google Cloud credentials are wired.

**Frontend direction:** Use `frontend/` as the canonical product UI going forward. The existing `src/` Next.js dashboard is the older scaffold and should not be the design source unless explicitly requested.

### Data flow (today)

```
src/data/mock-trip.ts  →  TripDashboard (state)  →  TripMap + Timeline + AgentPanel
src/types/trip.ts      →  all components (type-only imports)
localStorage           →  UserProfile persistence (key: "trip-agent:user-profile")
```

### Key files

| File | Role |
|---|---|
| `src/types/trip.ts` | All shared types: `Itinerary`, `ItineraryDay`, `MapPlace`, `UserProfile`, `DestinationPack`, etc. |
| `src/data/mock-trip.ts` | Single mock Japan itinerary + destination pack; source of truth until Gemini is wired |
| `src/components/TripDashboard.tsx` | Monolithic client component (~all UI). Contains inline sub-components: DayTabs, Timeline, AgentPanel, BookingList, AccountInterviewPanel, PlannerPanel |
| `src/components/TripMap.tsx` | React Leaflet map, lazy-loaded (SSR: false). Filters pins by active day; category-colored markers |
| `frontend/` | Preferred standalone product UI prototype. Use this for future frontend direction and migrate it into Next when wiring the app. |
| `src/app/api/agent/plan/route.ts` | Stub POST handler — returns mock itinerary; intended target for Gemini/FastAPI backend |
| `src/app/api/trips/route.ts` | Stub GET/POST — returns mock trip list; intended target for MongoDB Atlas |
| `backend/app/main.py` | FastAPI API with health, planning, trip persistence, and tool registry endpoints |

### Planned backend

- **Python FastAPI** on Google Cloud Run — agent orchestration
- **Gemini on Vertex AI / Google Cloud Agent Builder** — itinerary generation and agent orchestration
- **MongoDB Atlas** — user memory, destination packs, saved trips, chat sessions
- **MongoDB Atlas Vector Search** — semantic retrieval over Japan content and saved trip memory
- **MongoDB MCP server** — Rapid Agent partner-track integration
- **Google Maps Platform** — Places and Routes validation

When wiring the backend, the two API route stubs (`/api/agent/plan` and `/api/trips`) are the integration points. The `Itinerary` type in `src/types/trip.ts` is the contract between frontend and backend.
