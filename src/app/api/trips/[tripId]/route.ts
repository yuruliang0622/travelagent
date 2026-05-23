import { apiError, ok, readJson } from "@/lib/trip-agent/responses";
import { getTrip, updateTrip } from "@/lib/trip-agent/store";
import type { Itinerary } from "@/types/trip";

interface TripRouteContext {
  params: Promise<{ tripId: string }>;
}

export async function GET(_request: Request, context: TripRouteContext) {
  const { tripId } = await context.params;
  const trip = getTrip(tripId);

  if (!trip) {
    return apiError("not_found", `Trip not found: ${tripId}`, 404);
  }

  return ok({ trip });
}

export async function PATCH(request: Request, context: TripRouteContext) {
  const { tripId } = await context.params;
  const body = await readJson<Partial<Itinerary>>(request);

  if (!body) {
    return apiError("bad_request", "Expected a JSON trip patch.");
  }

  const trip = updateTrip(tripId, body);
  if (!trip) {
    return apiError("not_found", `Trip not found: ${tripId}`, 404);
  }

  return ok({ trip });
}
