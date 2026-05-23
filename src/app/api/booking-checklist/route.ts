import { apiError, ok, readJson } from "@/lib/trip-agent/responses";
import { getBookingChecklist, updateBookingChecklistItem } from "@/lib/trip-agent/store";
import type { BookingChecklistItem } from "@/types/trip";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("tripId");

  if (!tripId) {
    return apiError("validation_error", "Missing required query param: tripId");
  }

  const bookingChecklist = getBookingChecklist(tripId);
  if (!bookingChecklist) {
    return apiError("not_found", `Trip not found: ${tripId}`, 404);
  }

  return ok({ bookingChecklist });
}

export async function PATCH(request: Request) {
  const body = await readJson<{
    tripId?: string;
    itemId?: string;
    patch?: Partial<BookingChecklistItem>;
  }>(request);

  if (!body?.tripId || !body.itemId || !body.patch) {
    return apiError("validation_error", "Expected tripId, itemId, and patch.");
  }

  const item = updateBookingChecklistItem(body.tripId, body.itemId, body.patch);
  if (!item) {
    return apiError("not_found", "Trip or booking checklist item not found.", 404);
  }

  return ok({ item });
}
