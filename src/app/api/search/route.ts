import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";
import { readJson } from "@/lib/api";
import { normalizeQuery } from "@/lib/alphabet";
import { LIBRARY } from "@/lib/library";

const babel = createBabel();

export async function POST(request: Request) {
  const parsed = await readJson<{ text?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { text } = parsed.body;
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const query = normalizeQuery(text).trim().slice(0, LIBRARY.pageLength);
  if (!query) {
    return NextResponse.json({ error: "text contains no symbols of the Library's alphabet" }, { status: 400 });
  }
  return NextResponse.json({ address: babel.search(query), query });
}
