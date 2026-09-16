import { NextResponse } from "next/server";
import { libraryFor } from "@/lib/babel";
import { readJson } from "@/lib/api";
import { normalizeText } from "@/lib/alphabet";
import { LIBRARY } from "@/lib/library";

export async function POST(request: Request) {
  const parsed = await readJson<{ text?: unknown; lang?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { text, lang } = parsed.body;
  const babel = libraryFor(lang);
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const query = normalizeText(text, babel.config.alphabet).trim().slice(0, LIBRARY.pageLength);
  if (!query) {
    return NextResponse.json({ error: "text contains no symbols of the Library's alphabet" }, { status: 400 });
  }
  return NextResponse.json({ address: babel.search(query), query });
}
