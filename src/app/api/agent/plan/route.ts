import { ok, readJson } from "@/lib/trip-agent/responses";
import { planTrip, type AgentPlanRequest } from "@/lib/trip-agent/store";

const backendBaseUrl =
  process.env.TRIP_AGENT_BACKEND_URL ??
  process.env.NEXT_PUBLIC_TRIP_AGENT_BACKEND_URL ??
  "http://127.0.0.1:8000";

function camelToSnake(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelToSnake);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        camelToSnake(nestedValue),
      ]),
    );
  }

  return value;
}

function snakeToCamel(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(snakeToCamel);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        snakeToCamel(nestedValue),
      ]),
    );
  }

  return value;
}

export async function POST(request: Request) {
  const body = await readJson<AgentPlanRequest>(request);

  try {
    const backendResponse = await fetch(`${backendBaseUrl}/api/agent/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(camelToSnake(body ?? {})),
      cache: "no-store",
    });

    if (backendResponse.ok) {
      const backendData = snakeToCamel(await backendResponse.json());

      return ok({
        ...(backendData as Record<string, unknown>),
        plannedBackend: {
          currentRuntime: "Next.js BFF proxy + Python FastAPI backend",
          model: "Vertex AI Gemini",
          persistence: "MongoDB Atlas next",
          travelData: "Google Maps Platform next",
          mcp: "MongoDB MCP server next",
        },
      });
    }
  } catch {
    // Fall through to the local mock repository so the frontend remains demoable.
  }

  return ok({
    ...planTrip(body),
    plannedBackend: {
      currentRuntime: "Next.js Route Handlers",
      futureRuntime: "Python FastAPI on Cloud Run if orchestration outgrows BFF routes",
      model: "Gemini on Vertex AI",
      persistence: "MongoDB Atlas",
      travelData: "Google Maps Platform",
      mcp: "MongoDB MCP server",
    },
  });
}
