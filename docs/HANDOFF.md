# Trip Agent Handoff

Last updated: 2026-05-26

## Why This Handoff Exists

The current chat thread became long and slow. Start a new Codex window/thread and paste or reference this file so the next agent can continue without replaying the whole conversation.

## Project Location

```text
/Users/yuruliang/Documents/github_projects/Trip Agent
```

## Product Goal

Trip Agent is a hackathon MVP for an AI travel planner. The current product direction is:

- Start with a traveler profile and flight-first planning flow.
- Use real-ish flight options from SerpAPI Google Flights when available.
- Generate a route-first itinerary with Gemini/Vertex AI.
- Keep Japan as the curated demo route, but the product should eventually support global trips.
- After the itinerary is approved, let user choose booking tasks like hotels.
- Hotel Agent should use Google Places + SerpAPI Google Hotels and show compact cards.
- No real booking in v1; user reviews provider links before purchase.

## Current Architecture

Frontend:

```text
frontend/                    Static React/Babel frontend served on localhost:5174
frontend/index.html           Script loading order and cache-busted asset URLs
frontend/agent-chat.jsx       Main Reiko chat/interview/booking flow
frontend/agent-chat-ui.jsx    Chat rendering components/cards
frontend/agent-flow.js        Interview steps, flow helpers, plan summary helpers
frontend/api.js               Backend API calls
frontend/profile-utils.js     Local profile memory helpers
frontend/trip-normalizers.js  Backend itinerary -> visible trip UI normalization
frontend/direction-b.jsx      Main itinerary/map page
frontend/direction-sections.jsx  Overview, packing, booking, profile sections
frontend/trip-data.js         Static Japan fallback/sample trip
scripts/cache-bust-frontend.mjs  Auto-updates local asset ?v= hashes in index.html
```

Backend:

```text
backend/app/main.py           FastAPI routes
backend/app/agent/            Gemini planner, prompts, parser, route skeleton
backend/app/enrichment/       Quality guards, restaurant enrichment
backend/app/integrations/     Google/SerpAPI/Mongo integrations
backend/app/storage/          MongoDB Atlas repository/fallback memory
backend/tests/                Contract and planner quality tests
```

Docs:

```text
docs/PROJECT_MAP.md
docs/ARCHITECTURE.md
docs/SECRETS.md
docs/AGENT_PROJECT_PLAYBOOK.md
docs/HANDOFF.md
```

## How To Run

Backend:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent/backend"
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Frontend:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent"
npm run dev
```

Open:

```text
http://localhost:5174/
```

Important: `npm run dev` now runs cache bust first, then serves `frontend/`.

## Important Environment Notes

Backend `.env` lives at:

```text
backend/.env
```

Expected integrations/keys:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_MODEL`
- `GOOGLE_API_KEY`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `GOOGLE_MAPS_API_KEY`
- `SERPAPI_API_KEY` or equivalent SerpAPI env var if implemented in backend
- `ENABLE_LIVE_GEMINI=true`
- `ENABLE_LIVE_MAPS=true`

Do not print or commit real secrets.

## Recent Completed Work

### 1. Cache Busting

Added:

```text
scripts/cache-bust-frontend.mjs
```

Updated `package.json`:

```json
"cache:bust": "node scripts/cache-bust-frontend.mjs",
"dev": "npm run cache:bust && npx serve frontend -p 5174 --no-clipboard"
```

The script:

- Reads `frontend/index.html`.
- Finds local `.js`, `.jsx`, `.css` assets.
- Ignores external CDN URLs.
- Replaces `?v=...` with an 8-character SHA-256 content hash.

Verified:

- `node --check scripts/cache-bust-frontend.mjs` passed.
- `npm run cache:bust` ran successfully.
- `git diff --check` passed for touched files.

### 2. Chat Summary vs Left Itinerary Mismatch

Problem:

- Left day tabs and right chat summary disagreed because they used different city-detection logic.

Recent fix direction:

- Added shared helpers in `frontend/trip-normalizers.js`:
  - `majorRegionForDay(day)`
  - `summarizeTripForChat(trip)`
- Updated `agent-chat.jsx` to normalize backend itinerary with `normalizeBackendTrip(...)` before summarizing.
- Updated script order in `frontend/index.html` so `trip-normalizers.js` loads before files that use it.

User should hard refresh and regenerate a plan to verify.

### 3. Day Count From Calendar

Problem:

- User selected `2026-07-14 to 2026-07-19`, which should be 6 travel days, but UI showed 7 days.

Fix direction:

- `parseTravelDateRange(...)` already counted inclusive days correctly.
- `agent-chat.jsx` now stores parsed `tripDays` and uses it for plan generation instead of falling back to old/default 7-day demo.

User should regenerate the plan after selecting dates.

### 4. Hotel-only Booking Should Not Re-run Flight Search

Problem:

- After user selected flights early, later clicking `Find hotels` returned both flights and hotels.

Fix direction:

- `agent-chat.jsx` now tracks explicit booking intent `{ hasFlight, hasHotel }`.
- `Find hotels` should only call hotel search.
- `Book flights` should only call flight search.
- `Book both` may call both.

## Current Known Issues / Things To Verify Next

1. Browser verification after latest summary/cache-bust changes.
   - Open `http://localhost:5174/`.
   - Hard refresh.
   - Generate a 6-day Japan plan.
   - Confirm right chat summary matches left tabs exactly.

2. The repo is very dirty.
   - Many modified/deleted/untracked files exist from earlier work.
   - Do not run destructive git commands.
   - Do not revert user changes unless explicitly asked.

3. `__pycache__` files are tracked/modified in git status.
   - Consider adding/removing from git later, but do not clean destructively without user approval.

4. Frontend is static CDN React/Babel, not a bundler app.
   - `node -c` works for plain `.js`, not JSX/Babel files.
   - For JSX, verify by browser load or Babel runtime errors.

5. Booking flow still needs product cleanup.
   - User wants less repetitive agent dialogue.
   - Flight selection should not repeat in post-plan booking if already selected.
   - Hotel Agent should only ask hotel-specific preferences after route is ready.

6. Itinerary quality is still the core product risk.
   - User cares that Gemini output feels less dumb than raw API output.
   - Route-first planning should dominate; food/hotel should not drive the route.
   - Avoid hotels as attractions.
   - Include user preferences like onsen when selected.

## Suggested Next Prompt For New Window

Paste this into a new Codex window:

```text
I am continuing my Trip Agent project. Please read /Users/yuruliang/Documents/github_projects/Trip Agent/docs/HANDOFF.md first. Then inspect the current frontend behavior around chat summary vs left itinerary tabs. Do not make changes until you understand the current state. After that, help me verify and fix only the mismatch/cache/day-count flow.
```

## Best Next Engineering Step

Do a browser-level verification, not just code reading:

1. Start backend on 8000.
2. Start frontend with `npm run dev` on 5174.
3. Hard refresh browser.
4. Run a clean flow:
   - Japan curated demo
   - SFO or LAX
   - `2026-07-14 to 2026-07-19`
   - Select one flight
   - Pick route style/interests
   - Generate plan
5. Check:
   - Day tabs count is 6.
   - Chat summary count is 6.
   - Chat summary cities match tab cities.
   - `Find hotels` does not return flights.

## User Preferences To Remember

- User wants explanations in simple language, often Chinese/English mix.
- User wants a demo that works more than a huge feature set.
- User prefers options/buttons over open-ended typing.
- User wants the agent to reduce user thinking, not ask unnecessary questions.
- User dislikes long repetitive chat responses.
- User cares about product architecture and wants to learn why things are built that way.

## Safety Notes

- Never expose API keys.
- The project path has a space: always quote it in shell commands.
- Use `uvicorn app.main:app --reload --port 8000` for backend so code reloads.
- Use `npm run dev` for frontend so cache busting runs automatically.
