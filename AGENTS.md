<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Trip Agent Frontend Direction

Use `frontend/` as the canonical product UI direction going forward. It contains the preferred itinerary experience, visual language, map treatment, chat panel, and palette controls.

Treat the existing `src/` Next.js app as the current framework/API scaffold and older dashboard implementation. Future frontend work should either:

- migrate the `frontend/` experience into the Next.js app, or
- keep evolving `frontend/` directly if the user asks for prototype/UI changes.

Do not redesign from the older `src/components/TripDashboard.tsx` direction unless the user explicitly asks for it.
