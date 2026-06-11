# Reiko — Hackathon Pitch Script

**Target:** ~90 seconds | **Tone:** Confident, not salesy. Let the product speak.

---

## Slide 0 — Cover (5 sec)

> "Hi, I'm Yuru. This is Reiko — a personal travel curator that actually remembers who you are."

*[Click to Slide 1]*

---

## Slide 1 — Pain Point (12 sec)

> "Here's the state of trip planning today. **Eight tabs.** Flights, reviews, maps, blogs, spreadsheets. Nothing talks to each other, and nothing remembers what you liked last time. Every trip starts from zero."

*Pause, let the chaos visual land.*

> "The average trip is planned across ten-plus sites — and you still don't have a real plan."

*[Click to Slide 2]*

---

## Slide 2 — Solution (12 sec)

> "Reiko turns all of that into **one guided conversation** that builds a bookable itinerary. It remembers your preferences, asks focused questions, verifies every place against Google Maps, and gives you a complete route — not a list of links."

*Point to the "Verified by Google Maps" pill.*

*[Click to Slide 3 — THE MONEY SLIDE]*

---

## Slide 3 — Demo Walkthrough (30 sec)

> "Let me show you what this actually looks like."

*Walk through the 4 panels as you narrate:*

> "You set your profile once — home airport, budget, pace, interests. Pick a destination and dates. Then Reiko goes to work."

> *[Point to panel 3]* "It researches in real time — pulls real places from Google Maps, checks your taste profile from past trips, asks clarifying questions only when it needs to."

> *[Point to panel 4]* "And here's the payoff: **a 6-day Tokyo, Hakone, Kyoto trip — planned, verified, in under 30 seconds.** "

**🔥 MONEY SHOT — if you can show Trip #2 remembering Trip #1:**

> "But here's what actually matters. Watch this. I'm going to start a brand new trip — different destination. And Reiko already knows: I'm vegetarian, I hate early mornings, I love jazz bars. *It remembered me.* No other travel planner does this."

*Pause one beat. Let it land.*

> "That's not a prompt — that's persistent memory. MongoDB Atlas, queried through MCP, surfacing my taste profile before the agent even starts planning."

*[Click to Slide 4]*

---

## Slide 4 — Agent Orchestration (10 sec)

> "Here's what's happening under the hood. Trip request in, real data gathered from Maps and memory, the agent plans the route, everything gets fact-checked and enriched, and a ready itinerary comes out the other side. **Five stages, one pipeline.**"

*Don't dwell. This slide is architecture — move through it fast.*

*[Click to Slide 5]*

---

## Slide 5 — Agent Collaboration (12 sec)

> "The secret to the speed: **parallel specialist agents.** Instead of one agent doing everything sequentially, Reiko dispatches three at once — attractions, food, logistics. They report back, a review agent validates the trip, and if something doesn't align, it regenerates. **Full plan in seconds, not minutes.** "

*Point to the feedback loop at the bottom.*

> "That loop means quality isn't sacrificed for speed. The review agent catches conflicts and sends it back."

*[Click to Slide 6]*

---

## Slide 6 — Tech Stack + Memory (10 sec)

> "Built on **Gemini** for planning, **Google Maps** for ground truth, and **MongoDB Atlas with MCP** for persistent memory. That memory layer is our moat — Reiko is the only travel agent that gets to know you better every trip."

> "One conversation. One complete trip. Ready to travel. **Today it's Japan — the same engine works for any destination, and Reiko gets smarter every time you use it.** "

*Stop. Don't keep talking. Let the close breathe.*

---

## If you get follow-up questions:

| Question | Answer |
|---|---|
| "Does it only work for Japan?" | "Japan is our first destination pack — the engine, memory, and verification are destination-agnostic. Swap the pack, same pipeline." |
| "How is this different from ChatGPT?" | "Two things. One, memory — it remembers your taste across trips. Two, grounding — every place is verified against Google Maps, so you're not booking a restaurant that closed six months ago." |
| "What's the business model?" | "Affiliate revenue on bookings, and destination packs as a content moat." |

---

## What to cut if you're running long:

1. Slide 4 (Orchestration) — shrink to one sentence: *"Five stages: request, facts, plan, verify, itinerary."*
2. Slide 5 (Collaboration) — cut the feedback loop explanation, keep "parallel agents, seconds not minutes."
3. Never cut the memory moment on Slide 3. That's the whole pitch.

---

## Rehearsal notes:

- **Practice the Slide 3 transition.** That's where you switch from "telling" to "showing." It needs to feel natural, not rushed.
- **The memory reveal is your mic-drop.** Say it slower than you think you should. Let the judge process it.
- **Don't read the slides.** They're visual support. The words should come from you, not the screen.
- **End on the vision, not a "thank you."** "Reiko gets smarter every trip" is a stronger last impression than "thanks for listening."
