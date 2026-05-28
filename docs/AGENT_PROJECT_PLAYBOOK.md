# Agent Project Playbook / Agent 项目启动模板

Use this before building a new agent product. The goal is to decide the user flow, agent boundaries, and data contracts before writing too much code.

在开始一个新的 agent 项目前，先填这份模板。它的目的不是限制创意，而是先把用户流程、agent 权限、数据交接想清楚，避免后面不断返工。

---

## 1. Project North Star / 项目目标

### Core Problem / 核心问题

- What painful job is the user trying to finish?
- 用户真正想完成什么困难任务？

```text
User wants to:

Today they struggle because:

This agent helps by:
```

### Target User / 目标用户

- Who is this for?
- What do they already know?
- What do they not want to think about?

```text
Primary user:

User knowledge level:

User wants to avoid:

User is willing to choose:
```

### Success Criteria / 成功标准

Define what “good enough” means for v1.

```text
A successful demo means the user can:
1.
2.
3.

The agent should feel:

The agent should not:
```

### Demo Scope / Demo 范围

```text
In scope for v1:
-
-
-

Out of scope for v1:
-
-
-
```

Rule of thumb / 经验规则:

> A demo should prove one clear workflow, not every possible feature.
>
> Demo 要证明一个清楚的核心流程，而不是塞满所有功能。

---

## 2. User Journey / 用户流程

User journey is the path from opening the product to finishing the job. It is not the same as UI layout.

User journey 是用户从打开产品到完成目标的路径，不是单纯的页面设计。

### Journey Questions / 先问这些问题

```text
1. What is the first thing the user needs to tell us?
   用户第一步必须告诉系统什么？

2. When does the user see the first useful result?
   用户什么时候第一次看到有价值的结果？

3. Which steps require user choice?
   哪些步骤需要用户选择？

4. Which decisions should the agent make automatically?
   哪些决定应该由 agent 自动完成？

5. What is the final saved/confirmed output?
   最后用户确认或保存的结果是什么？
```

### Journey Table Template / 流程表模板

| Step | User Action / 用户动作 | Agent/System Action / 系统动作 | User Sees / 用户看到 | Output Data / 输出数据 |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |

### Travel Agent Example / 旅行 Agent 示例

| Step | User Action | Agent/System Action | User Sees | Output Data |
| --- | --- | --- | --- | --- |
| 1 | Creates profile | Saves stable preferences | Profile memory confirmation | `UserProfile` |
| 2 | Enters destination/date | Flight Agent searches options | 2-3 flight cards | `FlightOptions` |
| 3 | Selects flight | Route Agent builds route backbone | City/night split | `RouteBackbone` |
| 4 | Confirms route | Itinerary Agent fills daily plan | Day-by-day itinerary | `Itinerary` |
| 5 | Chooses hotel style | Hotel Agent recommends hotels | Hotel cards by city | `HotelOptions` |
| 6 | Saves trip | Backend persists trip | Saved trip page | `SavedTrip` |

Good journey pattern / 好的流程模式:

```text
Profile
→ Trip request
→ Core constraint
→ Route/backbone
→ Details
→ Confirmation
→ Save
```

For travel / 对旅行产品:

```text
Profile memory
→ Flight search
→ Route backbone
→ Daily itinerary
→ Hotel recommendation
→ Booking checklist
→ Saved trip
```

---

## 3. Agent Responsibility / Agent 权限边界

Agent responsibility defines what each agent can decide and what it cannot decide.

Agent responsibility 是为了防止多个 agent 抢同一个决定。

### Key Rule / 核心规则

> Only one agent should own each major decision.
>
> 每个重要决策只能有一个 owner。

Helper agents can enrich, validate, or recommend. They should not override the core decision owner.

辅助 agent 可以补充、验证、推荐，但不能推翻核心决策 agent。

### Responsibility Matrix Template / 权限表模板

| Agent | Can Decide / 可以决定 | Cannot Decide / 不能决定 | Input | Output | Runs When |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

### Travel Agent Example / 旅行 Agent 示例

| Agent | Can Decide | Cannot Decide | Input | Output | Runs When |
| --- | --- | --- | --- | --- | --- |
| Flight Agent | Flight options, airport timing | Attractions, hotels, route logic | `TripRequest`, `UserProfile` | `FlightOptions`, `SelectedFlight` | Before route planning |
| Route Agent | City order, night split, intercity transport | Specific restaurants, hotels | `TripRequest`, `SelectedFlight` | `RouteBackbone` | After flight selection |
| Itinerary Agent | Daily attractions, pacing, time blocks | Change route backbone without reason | `RouteBackbone`, preferences | `Itinerary` | After route is confirmed |
| Hotel Agent | Hotel options per stay city | Change route or city split | `RouteBackbone`, hotel preferences | `HotelOptions`, `SelectedHotels` | After itinerary route exists |
| Food Agent | Local food suggestions | Dominate itinerary or change route | `Itinerary`, food preferences | `FoodSuggestions` | Optional after itinerary |
| Memory Agent | Retrieve saved preferences/trips | Decide route or booking | `UserProfile`, query | `MemoryContext` | Whenever context is needed |

### Agent Boundary Checklist / Agent 边界检查

Before building an agent, answer:

```text
This agent owns this decision:

This agent must never decide:

This agent needs these inputs:

This agent returns this output:

If this agent fails, fallback is:
```

Red flags / 危险信号:

```text
- Two agents can both change the same core plan.
- 一个 agent 的 output 是一大段自然语言，没有结构化数据。
- Frontend has to guess what the agent meant.
- API results decide strategy instead of validating strategy.
- Helper agents can override route, budget, or user constraints.
```

---

## 4. Data Contracts / 数据合同

Data contracts are fixed JSON shapes passed between steps, agents, backend, and frontend.

Data contract 是每一步交接时使用的固定 JSON 格式。它让系统不用从自然语言里猜状态。

### Core Idea / 核心概念

```text
Natural language = for users
JSON contract = for systems and agents

自然语言 = 给用户看
JSON 数据合同 = 给系统和下一个 agent 用
```

Every step should answer:

```text
1. What JSON does this step output?
   这一步输出什么 JSON？

2. Which next step consumes it?
   下一步谁会用它？

3. Which fields are required?
   哪些字段必须存在？

4. Which fields are controlled by code, not LLM?
   哪些字段要由代码校验，不能让 LLM 随便改？

5. What happens if this data is missing or invalid?
   数据缺失或错误时怎么办？
```

### Contract 1: UserProfile / 用户长期记忆

Use this for stable preferences that rarely change.

用于长期稳定信息，不要放每次旅行才会变的偏好。

```json
{
  "user_id": "user-123",
  "name": "Yuru",
  "home_airport": "SFO",
  "default_travelers": 2,
  "budget_style": "moderate",
  "pace_preference": "balanced",
  "food_restrictions": [],
  "accessibility_needs": [],
  "past_saved_trips": []
}
```

Should include / 应该包含:

```text
- Name
- Email or user id
- Home airport
- Default travelers
- Usual budget style
- Usual pace
- Food restrictions
- Accessibility needs
```

Should not include / 不应该包含:

```text
- This trip's destination
- This trip's hotel style
- This trip's exact restaurants
- Temporary mood/preferences
```

### Contract 2: TripRequest / 本次旅行需求

Use this for trip-specific intent.

```json
{
  "destination": "Japan",
  "days": 7,
  "season": "summer",
  "travelers": 2,
  "interests": ["onsen", "culture", "nature"],
  "constraints": ["no early mornings"],
  "trip_style": "lesser-known local route"
}
```

Consumes / 谁使用:

```text
- Flight Agent
- Route Agent
- Itinerary Agent
```

### Contract 3: FlightSelection / 航班选择

Use flight data to create realistic arrival/departure constraints.

```json
{
  "selected_flight": {
    "airline": "ANA",
    "origin": "SFO",
    "arrival_airport": "NRT",
    "arrival_city": "Tokyo",
    "arrival_time": "2026-07-02T15:30:00",
    "departure_airport": "KIX",
    "departure_city": "Osaka",
    "departure_time": "2026-07-09T18:40:00",
    "price_usd": 1450,
    "stops": 0,
    "booking_url": "https://example.com"
  }
}
```

Important / 重要:

```text
Route Agent must respect arrival and departure cities.
Route Agent must not schedule heavy sightseeing right after arrival.
Last day must respect departure time.
```

### Contract 4: RouteBackbone / 路线骨架

This is often the most important contract in planning products.

这是规划类 agent 最关键的数据合同。它决定大方向，后面的 agent 不能随便改。

```json
{
  "route": "Tokyo → Hakone → Kyoto → Osaka",
  "night_split": [
    { "city": "Tokyo", "nights": 2 },
    { "city": "Hakone", "nights": 1 },
    { "city": "Kyoto", "nights": 2 },
    { "city": "Osaka", "nights": 1 }
  ],
  "must_include": ["onsen", "major temples", "local neighborhoods"],
  "avoid": ["hotel as attraction", "too many restaurants", "backtracking"],
  "daily_backbone": [
    {
      "day": 1,
      "city": "Tokyo",
      "purpose": "arrival + easy evening"
    },
    {
      "day": 2,
      "city": "Tokyo",
      "purpose": "classic Tokyo culture"
    },
    {
      "day": 3,
      "city": "Hakone",
      "purpose": "onsen + nature"
    }
  ]
}
```

Consumes / 谁使用:

```text
- Itinerary Agent uses daily_backbone.
- Hotel Agent uses night_split.
- Map UI uses route and cities.
- Booking checklist uses city/date structure.
```

Rules / 规则:

```text
- Itinerary Agent follows the route backbone unless impossible.
- Hotel Agent cannot change the city split.
- Food Agent cannot change the route.
- Places API validates places; it does not decide the route.
```

### Contract 5: Itinerary / 每日行程

Use explicit segment types so the system understands what each item is.

一定要有 `type`，否则系统会分不清酒店、景点、餐厅、交通。

```json
{
  "days": [
    {
      "day": 1,
      "date": "2026-07-02",
      "city": "Tokyo",
      "purpose": "arrival + easy evening",
      "segments": [
        {
          "time": "15:30",
          "type": "flight",
          "title": "Arrive at Narita Airport",
          "place_id": "nrt-airport",
          "why": "Arrival timing shapes a light first day."
        },
        {
          "time": "18:30",
          "type": "neighborhood",
          "title": "Shinjuku evening walk",
          "place_id": "shinjuku",
          "why": "Easy first-night area with food and transit access."
        }
      ]
    }
  ]
}
```

Recommended segment types / 推荐类型:

```text
flight
hotel
transit
attraction
culture
restaurant
shopping
wellness
neighborhood
free_time
```

Quality rules / 质量规则:

```text
- A hotel segment is allowed only for check-in, luggage, overnight, or stay logistics.
- A restaurant segment should not dominate the day.
- Explicit preferences must appear in the itinerary.
- Arrival and departure timing must be visible.
```

### Contract 6: HotelSelection / 酒店选择

Use this only after route and stay cities are known.

```json
{
  "selected_hotels": [
    {
      "city": "Tokyo",
      "check_in": "2026-07-02",
      "check_out": "2026-07-04",
      "nights": 2,
      "hotel_name": "Example Hotel Shinjuku",
      "area": "Shinjuku",
      "price_per_night_usd": 180,
      "rating": 4.4,
      "review_count": 1200,
      "maps_url": "https://maps.google.com/..."
    }
  ]
}
```

Consumes / 谁使用:

```text
- Booking checklist
- Final trip summary
- Saved trip
- User confirmation UI
```

---

## 5. Quality Guards / 质量检查

Do not rely only on prompt instructions. Important rules should be checked by code.

不要只相信 prompt。重要规则要用代码兜底。

### General Guard Checklist / 通用检查

```text
[ ] Required fields exist.
[ ] IDs are stable.
[ ] No duplicate major items.
[ ] User explicit preferences are represented.
[ ] Forbidden items are removed or corrected.
[ ] API fallback exists.
[ ] LLM output is validated before frontend renders it.
[ ] Frontend does not parse vague natural language when JSON should exist.
```

### Travel Agent Guard Checklist / 旅行产品检查

```text
[ ] Flight arrival/departure affects Day 1 and last day.
[ ] Hotel names are not used as sightseeing stops.
[ ] Restaurants are limited to 1-2 per day unless user asks for food tour.
[ ] Route does not backtrack unnecessarily.
[ ] User preferences like onsen/nature/culture are included.
[ ] Each day has a realistic mix of places and rest.
[ ] Places API enriches/validates but does not decide the route.
[ ] Fallback itinerary works when Gemini or external APIs fail.
```

---

## 6. Build Order / 推荐开发顺序

A safe order for agent projects:

```text
1. Write user journey.
2. Define agent responsibilities.
3. Define data contracts.
4. Build mock frontend flow.
5. Build backend API with mock responses.
6. Connect LLM for one core task.
7. Add deterministic quality guards.
8. Add real external APIs.
9. Add memory/database.
10. Polish demo and error states.
```

Avoid this order / 避免这个顺序:

```text
1. Connect many APIs first.
2. Add many agents before ownership is clear.
3. Let frontend invent business logic.
4. Fix every bad output only by adding more prompt text.
5. Keep changing the user journey after code is built.
```

---

## 7. Pre-Build Questions / 开工前问题清单

Before coding, answer these:

```text
User Journey
- What are the 5-7 steps from start to finish?
- What does the user confirm?
- What does the agent decide automatically?

Agent Responsibility
- Which agent owns the main decision?
- Which agents are only helpers?
- What can each agent never change?

Data Contract
- What JSON does each step output?
- Which step consumes that JSON?
- Which fields must be validated by code?

Quality
- What are the top 5 unacceptable mistakes?
- How will code catch them?
- What is the fallback when API/LLM fails?

Demo
- What is the one workflow judges/users must understand?
- Which features are intentionally not in v1?
```

---

## 8. One-Sentence Reminder / 一句话提醒

> Agent projects are not about letting AI do everything. They are about deciding who makes which decision, when, and in what format.
>
> Agent 项目不是让 AI 做所有事情，而是先设计清楚：谁在什么时候决定什么，以及用什么数据格式交接。
