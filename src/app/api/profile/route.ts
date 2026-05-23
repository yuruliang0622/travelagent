import { apiError, ok, readJson } from "@/lib/trip-agent/responses";
import { getProfile, updateProfile } from "@/lib/trip-agent/store";
import type { UserProfile } from "@/types/trip";

export async function GET() {
  return ok({ profile: getProfile() });
}

export async function PUT(request: Request) {
  const body = await readJson<Partial<UserProfile>>(request);
  const profile = updateProfile(body);

  if (!profile) {
    return apiError("bad_request", "Expected a JSON profile patch.");
  }

  return ok({ profile });
}
