import { apiError, ok } from "@/lib/trip-agent/responses";
import { listPlaces } from "@/lib/trip-agent/store";
import type { PlaceCategory } from "@/types/trip";

const categories: PlaceCategory[] = [
  "airport",
  "hotel",
  "restaurant",
  "attraction",
  "shopping",
  "transit",
  "culture",
  "wellness",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  if (category && !categories.includes(category as PlaceCategory)) {
    return apiError("validation_error", `Unsupported place category: ${category}`);
  }

  return ok({
    places: listPlaces({
      tripId: searchParams.get("tripId"),
      query: searchParams.get("q"),
      category: category as PlaceCategory | null,
    }),
  });
}
