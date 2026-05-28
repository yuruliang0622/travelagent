## Trip Agent Frontend Direction

Use `frontend/` as the canonical product UI. It is a static React prototype served from plain HTML with CDN React/Babel, and it contains the preferred itinerary experience, visual language, map treatment, chat panel, and palette controls.

The old Next.js `src/` app is no longer the active direction. Do not revive or redesign from the older `src/components/TripDashboard.tsx` direction unless the user explicitly asks for it.

## Trip Agent Backend Direction

Use the simplified backend package layout:

- `backend/app/agent/` for Gemini planning, prompts, parsing, and tool dispatch.
- `backend/app/integrations/` for external services such as Google Maps, Gemini embeddings, and MongoDB MCP.
- `backend/app/storage/` for persistence and MongoDB Atlas repository code.
- `backend/app/enrichment/` for post-processing that enriches generated itineraries.

我正在学习开发想通过这个项目学代码。请遵守以下规则:

1. 改代码前,先用大白话说计划,我确认后再动手
2. 引入任何新概念(新库、新语法、新模式),先用比喻解释,再讲术语
3. 代码改完后,主动指出"这里有个概念你可能没见过:XXX",并用 2-3 句话教我
4. 不要假设我懂 async、decorator、closure、hook 这类概念,遇到就解释
5. 鼓励我问"为什么不这样写",并认真比较两种写法的取舍