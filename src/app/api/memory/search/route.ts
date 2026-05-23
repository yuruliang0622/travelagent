import { ok, readJson } from "@/lib/trip-agent/responses";
import { searchMemory, type MemorySearchRequest } from "@/lib/trip-agent/store";

export async function POST(request: Request) {
  const body = await readJson<MemorySearchRequest>(request);

  return ok({
    mode: "lexical-mock",
    nextSearchLayer: "MongoDB Atlas Vector Search",
    results: searchMemory(body),
  });
}
