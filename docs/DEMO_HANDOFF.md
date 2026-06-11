# Reiko Demo Deck Handoff

Last updated: 2026-06-03

## Purpose

This handoff is for the next agent continuing the Reiko demo presentation work.
The current deck is an HTML presentation, not a PPTX.

Deck file:

```text
/Users/yuruliang/Documents/New project/reiko-demo-ppt.html
```

Open in browser:

```text
file:///Users/yuruliang/Documents/New%20project/reiko-demo-ppt.html
```

Use arrow keys or the numbered buttons to present.

## Current Deck Structure

The deck has 6 slides:

1. **Pain Point**
   - Headline: `Trip planning is still fragmented.`
   - Shows fragmented tools: flights, blogs, maps, hotels, reviews, spreadsheets.

2. **Product Solution**
   - Headline: `Reiko turns scattered research into one guided conversation.`
   - Shows before/after: fragmented tools -> Reiko conversation.

3. **Demo Walkthrough**
   - Headline: `User journey with Reiko.`
   - Four steps: create profile, choose Japan/dates, agent plans, itinerary appears.
   - Contains placeholder UI cards. Best improvement: replace with real Reiko screenshots.

4. **High-Level Pipeline**
   - Headline: `From request to itinerary.`
   - Keep this simple.
   - Current pipeline:

```text
Frontend Input -> Prefetch Data -> Agent -> Post-fill -> UI Output
```

   Current bottom captions:

```text
Trip request -> Real data -> Draft plan -> Verified trip -> Ready itinerary
```

   Intent: explain the whole planning system in one easy-to-read line.
   Do not make this slide dense. Slide 5 is for orchestration detail.

5. **Agent Collaboration**
   - Headline: `Reiko dispatches specialist agents in parallel.`
   - This is the focused orchestrator-agent slide.
   - Current flow:

```text
Orchestrator Router
        |
        +-- parallel dispatch -> Attraction Agent
        +-- parallel dispatch -> Food Agent
        +-- parallel dispatch -> Logistics Agent

Attraction Agent + Food Agent + Logistics Agent
        |
        v
Review Agent
        |
        v
Final Trip Synthesis
```

   Important wording constraint:
   - These are **conceptual orchestration roles** implemented by the planner pipeline.
   - Do not claim they are separate deployed backend services/classes.

   Code mapping:
   - Attraction Agent -> `prefetch_attractions`
   - Food Agent -> `prefetch_restaurants`
   - Logistics Agent -> route skeleton, transit, parallel day planning
   - Review Agent -> `replace_unknown_attractions`, `improve_itinerary_quality`, place details
   - Final Trip Synthesis -> final itinerary JSON, UI render, saved trip

6. **Tech Stack + Memory**
   - Headline: `Hackathon stack, shown in the product.`
   - This slide was simplified from a dense table into a proof diagram.
   - Current proof blocks:

```text
Agent intelligence: Gemini + Agent Builder
Grounding data: Google Maps Platform
Partner track: MongoDB MCP + Atlas
Web app: React frontend
Backend: FastAPI on Cloud Run
```

   Closing line:

```text
One conversation. One complete trip. Ready to travel.
```

## Design Direction

Use a clean product UI style matching the frontend:

- Apple-inspired graphite / light gray base
- System font
- White or lightly tinted panels
- 8-14px radius
- Thin borders
- Restrained color by role
- No decorative gradients, no glassmorphism, no busy card grids

Current role colors:

```text
Frontend / UI: blue
Backend / orchestrator: violet
Maps / place data: green
MongoDB MCP / memory: teal
Gemini / planning: amber
Review / enrichment: rose
```

## Hackathon Requirements To Emphasize

The Rapid Agent Hackathon relevance should be presented as:

- Functional agent experience
- Gemini / Google Cloud AI planning
- Google Cloud Agent Builder or agent orchestration story
- Google Cloud deployment / backend
- Partner MCP integration: MongoDB MCP
- MongoDB Atlas memory and saved trips
- Real-world grounding through Google Maps Platform

Avoid making the stack slide too text-heavy. Judges should understand it in under 10 seconds.

## Demo Storyline

The deck should support this demo flow:

```text
Pain point
-> Reiko solves it
-> User journey
-> High-level pipeline
-> Agent collaboration detail
-> Hackathon tech proof
```

The most important story:

```text
Reiko does not just chat.
It gathers real data, uses memory, coordinates specialist planning roles,
fills and verifies the itinerary, then saves the trip for future personalization.
```

## Current User Preferences

The user wants:

- Simple, direct slide language
- Slide 4 to stay high-level
- Slide 5 to show only the orchestrator router and parallel agents, not the full parser/conflict-monitor flow
- Slide 6 to avoid dense tables
- Product-style visuals that match the Reiko frontend
- Colorful enough to read, but not visually noisy

Recent wording choices the user approved or requested:

- Slide 4 headline: `From request to itinerary.`
- Slide 4 captions: `Trip request`, `Real data`, `Draft plan`, `Verified trip`, `Ready itinerary`
- Slide 5 focus: `Orchestrator Router -> Attraction Agent / Food Agent / Logistics Agent -> Review Agent -> Final Trip Synthesis`

## Files And Code References

Deck:

```text
/Users/yuruliang/Documents/New project/reiko-demo-ppt.html
```

Main backend orchestration reference:

```text
/Users/yuruliang/Documents/github_projects/Trip Agent/backend/app/agent/planner.py
```

Relevant implementation stages:

- `prefetch_attractions`
- `search_past_trips (MongoDB MCP)`
- `_build_skeleton`
- `ThreadPoolExecutor`
- `prefetch_restaurants`
- `replace_unknown_attractions`
- `improve_itinerary_quality`
- `batch_get_place_details`
- `save_trip`

Demo script:

```text
/Users/yuruliang/Documents/github_projects/Trip Agent/docs/DEMO_SCRIPT.md
```

## Good Next Improvements

1. Replace slide 3 placeholder cards with real screenshots from the Reiko UI.
2. Visually check slides 4-6 in browser after each edit.
3. If exporting to actual PPTX is needed, use the HTML as the source of truth.
4. Keep all explanations concise. The deck supports a 3-minute demo, so slides should not require long reading.

## Current Browser State

The user had the in-app browser open at:

```text
file:///Users/yuruliang/Documents/New%20project/reiko-demo-ppt.html
```

If continuing immediately, refresh the browser after edits.
