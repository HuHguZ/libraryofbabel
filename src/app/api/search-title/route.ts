import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";
import { readJson } from "@/lib/api";
import { normalizeQuery } from "@/lib/alphabet";
import { LIBRARY } from "@/lib/library";

const babel = createBabel();

export async function POST(request: Request) {
  const parsed = await readJson<{ title?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { title } = parsed.body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const query = normalizeQuery(title).trim().slice(0, LIBRARY.titleLength);
  if (!query) {
    return NextResponse.json({ error: "title contains no symbols of the Library's alphabet" }, { status: 400 });
  }
  return NextResponse.json({ address: babel.searchTitle(query), query });
}
