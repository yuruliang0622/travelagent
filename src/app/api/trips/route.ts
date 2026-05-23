import { created, ok, readJson } from "@/lib/trip-agent/responses";
import { listTripSummaries, saveTrip } from "@/lib/trip-agent/store";
import type { Itinerary } from "@/types/trip";

export async function GET() {
  return ok({
    mode: "mock-repository",
    trips: listTripSummaries(),
  });
}

export async function POST(request: Request) {
  const body = await readJson<Partial<Itinerary>>(request);
  const trip = saveTrip(body);

  return created({
    mode: "mock-repository",
    saved: true,
    trip,
    nextPersistenceLayer: "MongoDB Atlas",
  });
}
