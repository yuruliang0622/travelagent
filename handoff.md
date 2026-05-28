# Handoff — Architecture Fix: Skeleton + Per-Day Pipeline

Date: 2026-05-28

## Problem

Current trip quality is bad — cities don't match, "Explore Tokyo" text everywhere, restaurants/attractions from wrong cities. Root cause: one giant prompt with all 5 cities' attractions mixed together → Gemini confuses which attraction is in which city.

## What to do

### Step 1: Fix the `[]` bug (1 line)

**File**: `backend/app/agent/planner.py`, line 165

Change:
```python
itinerary = apply_real_restaurants(itinerary, restaurants, slug, [])
```
To:
```python
itinerary = apply_real_restaurants(itinerary, restaurants, slug, attractions)
```

This stops "Explore Tokyo" from appearing everywhere.

### Step 2: Add skeleton prompt

**File**: `backend/app/agent/prompts.py`

Add `build_skeleton_prompt(destination, days, preferences)` — a minimal prompt that asks Gemini to output ONLY a city-per-day plan:
```json
[{"day": 1, "city": "Tokyo"}, {"day": 2, "city": "Hakone"}, ...]
```

System prompt should say: "只输出每天在哪个城市，不要写任何景点细节。"

If the user already typed "D1 Tokyo, D2 Kyoto" in their prompt, skip Gemini and use `day_allocation_from_prompt()` from `request_helpers.py` directly.

**File**: `backend/app/agent/parser.py`

Add `parse_skeleton(text: str) -> list[dict]` — parse the JSON array, return list of `{day_number, city}` dicts.

### Step 3: Add per-day prompts

**File**: `backend/app/agent/prompts.py`

Add two functions:

`build_day_system_prompt(city: str) -> str`:
```
你是 {city} 的本地导游。你只推荐 {city} 范围内的景点和餐厅。
禁止推荐其他城市的任何地点。
严格使用 APPROVED ATTRACTIONS 列表中的名字。
```

`build_day_user_message(day_number, city, city_attractions, profile) -> str`:
- Only includes `city_attractions` (~5-8 attractions, NOT all 24)
- Includes day number, date, pace, budget, interests
- Same JSON output format as current single-day output

### Step 4: Restructure planner

**File**: `backend/app/agent/planner.py` — `_try_agent_plan()`

New flow:
```
1. prefetch_attractions (unchanged, still fetch all cities at once)
2. Generate skeleton:
   a. Try parse day_allocation from user prompt (day_allocation_from_prompt)
   b. If empty, call Gemini with build_skeleton_prompt()
   c. Parse result with parse_skeleton()
3. For each day in skeleton:
   a. Filter attractions: city_atts = [a for a in attractions if same city]
   b. Call Gemini with build_day_system_prompt(city) + build_day_user_message(...)
   c. Parse result into ItineraryDay
4. Assemble all days into Itinerary
5. Run existing restaurant enrichment (prefetch_restaurants → apply_real_restaurants → replace_unknown_attractions)
6. Return
```

Optional: per-day Gemini calls can run in parallel with ThreadPoolExecutor (pattern already in `attractions.py:159`).

### Step 5: Remove dangerous cross-city fallback

**File**: `backend/app/enrichment/attractions.py`, line 223

Change:
```python
fallback = city_attractions or prefetched
```
To keep the original Gemini title when no same-city matches:
```python
if not city_attractions:
    updated_segments.append(seg)
    continue
```

## Key principle

Each day's Gemini call only sees attractions from that day's city. No cross-city data in context → impossible for Gemini to confuse which city an attraction belongs to.

## Files to modify

| File | What |
|------|------|
| `backend/app/agent/prompts.py` | Add 3 new prompt functions |
| `backend/app/agent/parser.py` | Add parse_skeleton(), parse_day_json() |
| `backend/app/agent/planner.py` | Restructure _try_agent_plan, fix []→attractions |
| `backend/app/enrichment/attractions.py` | Remove cross-city fallback |

## How to run & verify

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

Verify:
1. Generate a 6-day Japan trip
2. No "Explore Tokyo" / "Explore Kyoto" / "Explore {any city}" text in any segment
3. Day city labels match actual attraction locations (D2 tagged Kyoto → Kyoto attractions)
4. Restaurants are from the same city as the day (no Kyoto restaurant on Tokyo day)

## Important notes

- Project path has a space: always quote it in shell commands
- `backend/.env` has all API keys — don't print or commit them
- Only 1 git commit in this repo (`Initial Trip Agent MVP`) — commit your changes when done
- The `city` field in prefetched attractions is set in `attractions.py:_select_attractions` line 138: `"city": city`
- Use `.venv` for backend Python, `npx serve` for frontend
