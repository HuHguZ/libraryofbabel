import { NextResponse } from "next/server";
import { libraryFor } from "@/lib/babel";
import { readJson } from "@/lib/api";
import { normalizeText } from "@/lib/alphabet";
import { LIBRARY } from "@/lib/library";

export async function POST(request: Request) {
  const parsed = await readJson<{ title?: unknown; lang?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { title, lang } = parsed.body;
  const babel = libraryFor(lang);
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const query = normalizeText(title, babel.config.alphabet).trim().slice(0, LIBRARY.titleLength);
  if (!query) {
    return NextResponse.json({ error: "title contains no symbols of the Library's alphabet" }, { status: 400 });
  }
  return NextResponse.json({ address: babel.searchTitle(query), query });
}
