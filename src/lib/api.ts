import { NextResponse } from "next/server";

/** Parses a JSON request body, answering 400 instead of throwing on malformed or aborted input. */
export async function readJson<T extends object>(request: Request): Promise<{ body: T } | { error: NextResponse }> {
  try {
    const body = (await request.json()) as T;
    if (!body || typeof body !== "object") {
      return { error: NextResponse.json({ error: "invalid json body" }, { status: 400 }) };
    }
    return { body };
  } catch {
    return { error: NextResponse.json({ error: "invalid json body" }, { status: 400 }) };
  }
}
