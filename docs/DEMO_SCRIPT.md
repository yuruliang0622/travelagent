# Reiko — Demo Script

~3 分钟，英文录制

---

## 录制前检查

- [ ] 后端跑在 `localhost:8000`，`/health` 返回 ok
- [ ] 前端跑在 `localhost:5174`
- [ ] 清空浏览器 localStorage（让 profile 重置，demo 从头开始）
- [ ] 关闭其他标签页、通知、清理桌面
- [ ] 准备好录屏工具（推荐 Coherence Studio，免费 + AI 字幕）

---

## 时间线总览

| 时间 | 场景 | 讲什么 |
|------|------|--------|
| 0:00-0:15 | 标题卡 | 项目名 + 一句话定位 |
| 0:15-0:50 | 创建 Profile | 用户是谁、Agent 记住偏好 |
| 0:50-1:30 | Agent 采访 + 规划 | Reiko 问问题 → 背后调用工具 |
| 1:30-2:10 | 行程展示 | 地图、时间线、真实数据 |
| 2:10-2:40 | MCP + 记忆 | MongoDB MCP 在管道里的作用 |
| 2:40-3:00 | 结尾 | 技术栈总结 + 一句话收尾 |

---

## 逐段脚本

### 0:00-0:15 | 标题卡

> **[画面：Reiko logo + 标题文字]**

"Reiko. Your Personal Travel Curator. One conversation. One complete trip. Ready to travel."

*(停顿 2 秒)*

---

### 0:15-0:50 | 创建 Profile

> **[画面：打开 http://localhost:5174，看到欢迎页 / Profile 创建入口]**

"Planning a trip today means juggling five or six different websites. Google Flights for airfare. Travel blogs for inspiration. Google Maps for restaurants. Booking.com for hotels. And then you piece it all together yourself."

> **[画面：点击创建 Profile，填写 Name, Home Airport, Travelers, Budget, Pace, Interests]**

"Reiko replaces all of that with a single conversation. But first — it needs to know who you are."

> **[画面：填完 profile，点击保存]**

"I tell it my name, my home airport, my usual pace and budget. I pick the things I care about: traditional culture, nature, and onsen hot springs."

> **[画面：tool_trace 显示 "save_profile (MongoDB MCP)"]**

"This profile is saved through MongoDB's MCP server — so next time I come back, the agent remembers me."

---

### 0:50-1:30 | Agent 采访 + 规划

> **[画面：Reiko 聊天面板，"Welcome back" 消息出现]**

"Now Reiko, the travel agent, takes over. She already knows my preferences from my profile. She only asks what's specific to this trip."

> **[画面：选择 "Japan curated demo"，选择日期 7/14-7/19]**

"Where and when. Two clicks."

> **[画面：Reiko 自动搜索航班，展示 flight options]**

"Behind the scenes, she's already searching real flights. I pick one — and she anchors the trip around my arrival and departure times."

> **[画面：Reiko 说 "Got it. I'm going to turn this into a route now." — 然后 tool_trace 逐条出现]**

"Now watch what happens. The agent calls its tools, one by one."

> **[画面：tool_trace 展示]**

"Google Maps Places API — fetching real attractions. MongoDB MCP — searching my past trips for personalization. Then Gemini generates a route skeleton: which city each day. Then six days are generated in parallel, each one grounded in real attraction names, not AI hallucinations."

---

### 1:30-2:10 | 行程展示

> **[画面：行程生成完成，地图展开，6 天线出现]**

"And here's the result. Not a paragraph of text — a real itinerary."

> **[画面：Overview 模式，地图显示 Tokyo → Hakone → Kyoto 路线]**

"Six days. Tokyo to Hakone to Kyoto. A map showing the actual route. A timeline for each day."

> **[画面：点击 Day 3 Hakone，展示具体 stops]**

"Every stop has a real name, real coordinates, and real Google Maps data."

> **[画面：hover 评分 ⭐ 4.4 (4,800 reviews)、营业时间、Navigate 按钮]**

"Ratings. Reviews. Opening hours. One-click navigation. This isn't AI making things up — it's Google Maps Places data, pulled through the agent's tool calls."

> **[画面：展示 booking checklist]**

"The agent also builds a booking checklist. Hotels are matched to the right cities and the right nights."

---

### 2:10-2:40 | MCP + 记忆

> **[画面：tool_trace 完整展示，高亮 MCP 相关条目]**

"Let me show you what makes this different from a regular chatbot."

> **[画面：指向 tool_trace 中的 "search_past_trips (MongoDB MCP)" 和 "save_trip (MongoDB MCP)"]**

"The Model Context Protocol — MongoDB's MCP server — is wired directly into the trip generation pipeline. It searches past trips to personalize new plans. It saves completed trips so the agent's memory grows over time."

> **[画面：切换到另一个浏览器 tab，或者模拟 "come back later" — 展示 profile 还在]**

"When I come back to plan my next trip, the agent already knows I love onsen and nature. It doesn't start from zero."

---

### 2:40-3:00 | 结尾

> **[画面：回到完整 itinerary 俯瞰 + 技术栈 logos]**

"Reiko is built on Gemini on Vertex AI for planning. Google Maps Platform for real-world place data. MongoDB Atlas with MCP for memory and persistence. One conversation. One complete trip. Ready to travel."

---

## 录制工具推荐

| 工具 | 价格 | 特点 |
|------|------|------|
| [Coherence Studio](https://github.com/getcoherence/studio) | 免费 | AI 自动字幕、自动剪静音、AI 配音 |
| [Screen Studio](https://screen.studio) | $89 | 自动缩放 + 鼠标效果最漂亮 |
| Mac QuickTime + iMovie | 免费 | 最基础，够用但没自动效果 |

**推荐 Coherence Studio**（免费 + AI 字幕节省大量时间）。

---

## 录制小贴士

1. **语速不要太快** — 比正常说话慢 10%，评委可能不是英语母语
2. **鼠标移动要刻意** — 不要晃来晃去，点到哪讲到哪
3. **提前跑一遍** — 确保 Gemini 生成结果看起来不错再开始录
4. **如果 Gemini 翻车** — 重新生成一次，别把坏结果录进去
5. **录 2-3 遍** — 选最好的一条，别指望一遍过
6. **字幕必须有** — 用 Coherence Studio 自动生成，然后校对一遍
