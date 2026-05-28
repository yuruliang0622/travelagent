# Handoff — 2026-05-28

## Branch

`fix/skeleton-per-day-pipeline` (ahead of `hackathon-demo`, ahead of `main`)

## What was done today

### Architecture: single giant prompt → skeleton + per-day pipeline

**Problem**: One prompt with all 5 cities' attractions mixed together → Gemini confused cities. "Explore Tokyo" everywhere. Restaurants/attractions from wrong cities.

**Solution**: 5-step restructure in `backend/app/agent/planner.py`:
1. **Prefetch** attractions for all cities (unchanged, Google Maps)
2. **Skeleton** — determine which city each day (from user prompt or Gemini)
3. **Per-day generation** — parallel Gemini calls, each only sees that city's attractions
4. **Assemble** — merge per-day results into full itinerary
5. **Enrichment** — restaurants + reviewers + place details

### Three-layer cross-city defense

| Layer | File | What |
|-------|------|------|
| 1 | `planner.py` | Per-day prompt only includes same-city attractions |
| 2 | `attractions.py:replace_unknown_attractions` | Only approves names in `city_approved` (same-city whitelist), not global `approved` |
| 3 | `restaurants.py:_limit_meal_segments_per_day` | `demote_to_attraction` picks same-city only, not global queue |

### Descriptions: no more user reviews

- `maps.py`: removed `reviews` from API fields, only use `editorial_summary`
- `attractions.py`: tag-based fallback labels ("Historic temple", "Scenic park")
- `restaurants.py`: tag-based fallback labels ("Wagyu beef restaurant", "Ramen shop")

### Quality reviewer wired in

- `improve_itinerary_quality` in `quality.py` was written but NEVER called
- Now runs after `replace_unknown_attractions` in the pipeline
- Dedupes, removes weak stops, injects iconic Japan places

### Frontend fixes

- `trip-normalizers.js:majorRegionForDay` — simplified from 15-line keyword guessing to `return day?.city || "Route"`
- `direction-sections.jsx` — "LODGING" → "LODGING checklist", Transit section shows simple mode labels ("Shinkansen", "Train", "Bus") instead of verbose notes
- Place details matching: exact → exact + substring fuzzy match

## Known issues (not yet fixed)

1. **Prefetch randomness** — `_select_attractions` uses `random.shuffle` + take 24. Some cities can get only 2 attractions. Fix: round-robin per city guaranteeing min 4.

2. **Nara not in `JAPAN_PACK.regions`** — gets 0 prefetched attractions. `_city_hint` defaults unknown cities to "tokyo" → wrong iconics injected. Fix: add Nara to regions + `JAPAN_ICONIC_STOPS`.

3. **Chat agent can't modify itineraries** — `CHAT_TOOLS` only has search_flights/search_hotels/search_memory. No tool to regenerate the plan with new parameters. When user says "remove Nara, D6 → Osaka", agent responds with text but left panel doesn't update. Fix: add a `regenerate_plan` tool.

## How to run

```bash
# Terminal 1: Backend
cd "/Users/yuruliang/Documents/github_projects/Trip Agent/backend"
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd "/Users/yuruliang/Documents/github_projects/Trip Agent"
npm run dev

# Open http://localhost:5174/
```

## Key files to know

| File | Purpose |
|------|---------|
| `backend/app/agent/planner.py` | Pipeline orchestration + `_resolve_place_details` |
| `backend/app/agent/prompts.py` | All prompts: skeleton, per-day system, per-day user |
| `backend/app/agent/parser.py` | `parse_skeleton`, `parse_day_allocation_string`, `itinerary_from_gemini` |
| `backend/app/enrichment/attractions.py` | Prefetch + `replace_unknown_attractions` (city-aware reviewer) |
| `backend/app/enrichment/restaurants.py` | Restaurant prefetch + `apply_real_restaurants` + `_limit_meal_segments_per_day` |
| `backend/app/enrichment/quality.py` | `improve_itinerary_quality` (dedup, weak stops, iconic inject) |
| `backend/app/integrations/maps.py` | Google Maps API: `get_place_details`, `search_text_multi` |
| `backend/app/data/mock_data.py` | `JAPAN_PACK` (regions list), `DESTINATION_PACKS` |
| `frontend/direction-sections.jsx` | Overview tab (Lodging/Flights/Transit/Budget cards) |
| `frontend/trip-normalizers.js` | `majorRegionForDay`, `summarizeTripForChat`, `normalizeBackendTrip` |
| `frontend/agent-chat.jsx` | Chat flow, booking flow |

## Important

- Project path has a space: always quote it in shell commands
- `backend/.env` has all API keys — don't print or commit
- Use `.venv` for backend Python
- Use `npm run dev` for frontend (runs cache bust first)
