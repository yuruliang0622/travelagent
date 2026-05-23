import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "validation_error"
  | "unsupported_operation";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function apiError(code: ApiErrorCode, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  return request.json().catch(() => null) as Promise<T | null>;
}
