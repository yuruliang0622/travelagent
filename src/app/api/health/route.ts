import { ok } from "@/lib/trip-agent/responses";

export async function GET() {
  return ok({
    service: "trip-agent-backend",
    status: "ok",
    mode: "mock-repository",
    checks: {
      destinationPacks: "ready",
      itineraryContracts: "ready",
      persistence: "pending-mongodb-atlas",
      modelRuntime: "pending-vertex-ai-gemini",
      mapsValidation: "pending-google-maps-credentials",
      partnerMcp: "pending-mongodb-mcp-server",
    },
  });
}
