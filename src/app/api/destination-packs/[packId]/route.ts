import { apiError, ok } from "@/lib/trip-agent/responses";
import { getDestinationPack } from "@/lib/trip-agent/store";

interface PackRouteContext {
  params: Promise<{ packId: string }>;
}

export async function GET(_request: Request, context: PackRouteContext) {
  const { packId } = await context.params;
  const destinationPack = getDestinationPack(packId);

  if (!destinationPack) {
    return apiError("not_found", `Destination pack not found: ${packId}`, 404);
  }

  return ok({ destinationPack });
}
