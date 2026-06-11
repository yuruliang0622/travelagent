# Trip Agent Handoff - 2026-06-10

## Project Location

```text
/Users/yuruliang/Documents/github_projects/Trip Agent
```

Frontend is static React/Babel in `frontend/`, served on `http://localhost:5174`.
Backend is FastAPI in `backend/`, served on `http://127.0.0.1:8000`.
Use `backend/.venv` for Python. Do not print or commit secrets from `backend/.env`.

The user is preparing a live demo today. They are learning to code, so explain changes in plain language. For demo work, prioritize a reliable, believable flow over adding broad new features.

## Current Demo Goal

Reiko should demo as an AI travel planning assistant that:

- understands the user's flight-first trip constraints,
- creates a curated 7-day Japan plan quickly,
- shows realistic daily itinerary details,
- preserves location details such as ratings and business hours,
- recommends hotels that feel respected and affordable, not luxury-only,
- lets the user explain the pain point in under 3 minutes.

The clearest demo story:

```text
Planning a trip is fragmented: flights, route, hotels, location details, and preferences live in different tabs.
Reiko turns a rough travel intent into a coherent route, then hands off to specialized agents for flights and hotels.
The demo should show that Reiko keeps the whole trip context instead of forcing the traveler to restart every search.
```

## Current Running State

Backend was run with:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent/backend"
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Frontend was run with:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent"
npm run dev
```

Current frontend URL:

```text
http://localhost:5174/
```

If the UI looks stale, hard refresh with `Cmd+Shift+R`.

## Important Sandbox Note For Next Agent

The active Codex writable root may be:

```text
/Users/yuruliang/Documents/New project
```

but the real repo is:

```text
/Users/yuruliang/Documents/github_projects/Trip Agent
```

Editing the real repo may require escalation. In the previous thread, edits were made by creating a temporary script under the writable root and running it against the real repo with approval.

## Recent Completed Demo Fixes

### 1. Curated Japan Demo Is Now 7 Days

File:

```text
backend/app/data/mock_data.py
```

The curated Japan fallback now uses a 7-day route:

```text
D1 Tokyo arrival
D2 Tokyo
D3 Hakone
D4 Kyoto
D5 Kyoto / Nara option
D6 Osaka food + return Tokyo
D7 Tokyo departure
```

Dates were updated to:

```text
Jul 15 - Jul 21, 2026
```

The goal was to stop Reiko from returning a 5-day plan when the user asks for 7 days.

### 2. Fast Curated-Demo Path Added

File:

```text
backend/app/agent/planner.py
```

Added a curated Japan fast path. When the request is clearly a Japan demo request, the planner skips slow Gemini generation and returns the curated itinerary directly.

This avoids:

- 3+ minute waits,
- Gemini 429/rate-limit issues,
- day 1/day 7 getting cut off,
- inconsistent city counts during a live demo.

Expected response markers:

```text
mode: mock
tool_trace includes curated_japan_demo
itinerary.days length: 7
place_details included
```

### 3. Location Details Were Added Back To Demo Data

File:

```text
backend/app/data/mock_data.py
```

Added `CURATED_JAPAN_PLACE_DETAILS` for demo locations, including:

- rating,
- review count,
- opening hours,
- Google Maps URL,
- website,
- business status.

Known keys include:

```text
yanaka
nakano
hakone
fushimi
namba
```

The backend was verified to return place details. If the frontend still does not show them, check the rendering path in `frontend/direction-b.jsx` and `frontend/trip-normalizers.js`.

### 4. Frontend Now Renders Curated Backend Trips

File:

```text
frontend/direction-b.jsx
```

Bug fixed: `applyGeneratedPlan` only trusted backend itineraries when mode looked live/provider. The curated Japan fast path returns `mode: mock`, so the frontend ignored it and kept showing old static sample content like:

```text
Narita Express to Shinjuku
Park Hyatt Shinjuku
Sunset at Shibuya Crossing
```

Current behavior should normalize and render any backend response with `data.itinerary`, including curated demo responses.

### 5. Mock Flight Destination Improved

File:

```text
backend/app/integrations/flights.py
```

Japan fallback now maps to:

```text
Tokyo (HND)
```

Mock arrivals also use next-day arrival dates when appropriate, so the route feels more realistic.

### 6. Hotel Recommendations Were Too Expensive - Updated

File:

```text
backend/app/integrations/hotels.py
```

The curated Japan fallback used luxury hotels such as Aman Tokyo, Gora Kadan, Hotel The Mitsui Kyoto, and Aman Kyoto. That made the demo feel unrealistic and too expensive.

It was changed to respected, more moderate options:

```text
Tokyo
- Hotel Metropolitan Tokyo Marunouchi - about $240/night
- Nohga Hotel Ueno Tokyo - about $185/night

Hakone
- Hakone Yutowa - about $260/night
- Hotel Okada - about $230/night

Kyoto
- Hotel Granvia Kyoto - about $235/night
- Nohga Hotel Kiyomizu Kyoto - about $190/night

Osaka
- Hotel The Flag Shinsaibashi - about $170/night
- Cross Hotel Osaka - about $210/night
```

These are demo estimates. Live prices should still be verified through Google Hotels/provider links.

Note: because live SerpAPI/Google hotel search is configured, the app may return live provider results before the curated fallback. A direct backend check returned cheaper live options in Tokyo, Hakone, Kyoto, and Osaka. If the demo needs the exact curated hotel names above, the next agent may need to force curated demo mode for the hotel step too.

### 7. CORS Updated For Frontend Port

File:

```text
backend/app/main.py
```

Allowed origins now include:

```text
http://localhost:5174
http://127.0.0.1:5174
```

This was needed because the frontend dev server uses `localhost:5174`.

## Verification Already Run

Direct planner check:

```text
PlanTripRequest(prompt="Plan a 7-day trip to Japan", destination="Japan", days=7)
=> mode mock
=> 7 days
=> tool_trace includes curated_japan_demo
=> place_details keys include fushimi, hakone, nakano, namba, yanaka
```

Actual API check:

```text
POST /api/agent/plan
=> full 7-day itinerary
=> place_details returned
```

Backend contract tests:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent/backend"
.venv/bin/python -m pytest tests/test_api_contracts.py -q
```

Result:

```text
21 passed, 4 warnings
```

Hotel file syntax check:

```bash
.venv/bin/python -m py_compile backend/app/integrations/hotels.py
```

Passed.

Direct hotel search check with live providers enabled returned live, lower-cost provider results before curated fallback, for example:

```text
Tokyo: Shinjuku Granbell Hotel, ONE@Tokyo, Koko Hotel Tsukiji Ginza
Hakone: Hakone Hotel, Onsen Guesthouse TSUTAYA, Mount View Hakone
Kyoto: Kyoto Tokyu Hotel, Mitsui Garden Hotel Kyoto Shinmachi Bettei
Osaka: VIA INN Shinsaibashi, Hearton Hotel Shinsaibashi Nagahoridori
```

## Current Known Risks / Next Things To Fix

### A. Location Details May Still Not Appear In UI

The backend returns place details, but the user still reported that the frontend did not show ratings/hours/business details.

Next agent should inspect:

```text
frontend/direction-b.jsx
frontend/trip-normalizers.js
frontend/direction-sections.jsx
```

Goal:

- each attraction/restaurant card should display rating,
- opening hours/business status should appear when available,
- Google Maps link should be visible or easy to open,
- the demo should not require the user to explain missing details verbally.

### B. Curated Hotels May Be Bypassed By Live Provider Results

The curated fallback is now affordable, but live SerpAPI/Google results run first when keys are enabled.

If the demo should show exactly two respected hotels per city, add a demo condition such as:

```text
destination contains Japan
or destination_pack_id == japan
or prompt/demo flag indicates curated demo
```

and return `_curated_japan_hotels(...)` before live provider search for demo flows.

Be careful: for the real product, live provider results are valuable. This should be demo-specific.

### C. Worktree Is Dirty

There are many modified files from previous sessions and demo work. Do not revert unrelated changes.

Observed modified areas include:

```text
backend/app/agent/*
backend/app/data/mock_data.py
backend/app/integrations/flights.py
backend/app/integrations/hotels.py
backend/app/main.py
frontend/*.jsx
frontend/*.js
docs/*
handoff.md
```

There are also generated/cache files and folders such as:

```text
__pycache__/
test-results/
Deck/
```

Do not delete user files unless explicitly asked.

## Suggested Next Agent First Steps

1. Hard refresh the app at `http://localhost:5174/`.
2. Generate or load the 7-day Japan demo.
3. Confirm visible tabs show D1-D7 without missing day 1 or day 7.
4. Click itinerary items and confirm ratings/hours/business details appear.
5. Run hotel preference flow and confirm hotel prices feel reasonable.
6. If hotels still show random provider options and the user wants curated demo hotels, force the curated Japan hotel path for demo only.

## Useful Commands

Backend:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent/backend"
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent"
npm run dev
```

Cache bust:

```bash
node scripts/cache-bust-frontend.mjs
```

Tests:

```bash
cd "/Users/yuruliang/Documents/github_projects/Trip Agent/backend"
.venv/bin/python -m pytest tests/test_api_contracts.py -q
```

Health:

```bash
curl -s http://127.0.0.1:8000/health
```

## Demo Script Reminder

For the 3-minute PM-style demo, focus on this pain point:

```text
Travel planning is not one decision. It is a chain of dependent decisions.
When flights, cities, hotels, restaurants, and opening hours are handled in separate tabs, travelers lose context and repeat themselves.
Reiko keeps that context and turns it into a route-first plan with booking handoffs.
```

Suggested flow:

1. Show the problem: too many tabs, repeated preferences, uncertainty about what is realistic.
2. Ask Reiko for a 7-day Japan trip.
3. Show flight anchor and route overview.
4. Show daily location details with ratings/hours.
5. Ask for hotels and show two realistic options per city.
6. Close with: Reiko does not just generate a list; it coordinates the trip decisions.
