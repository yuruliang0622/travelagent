import { ok } from "@/lib/trip-agent/responses";
import { listDestinationPacks } from "@/lib/trip-agent/store";

export async function GET() {
  return ok({ destinationPacks: listDestinationPacks() });
}
