import { NextResponse } from "next/server";
import { libraryFor } from "@/lib/babel";
import { readJson } from "@/lib/api";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const MAX_PAGES = 16;

/**
 * Several pages of one volume in a single round trip — the 3D reader asks for the open spread
 * and three spreads either way, so page turns never wait for the network.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ hex?: unknown; wall?: unknown; shelf?: unknown; volume?: unknown; pages?: unknown; lang?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { hex, wall, shelf, volume, pages, lang } = parsed.body;
  if (!isValidHex(hex)) {
    return NextResponse.json({ error: "hex is required" }, { status: 400 });
  }
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PAGES) {
    return NextResponse.json({ error: `pages must list 1..${MAX_PAGES} page numbers` }, { status: 400 });
  }
  const w = clampInt(wall, 1, LIBRARY.walls);
  const s = clampInt(shelf, 1, LIBRARY.shelves);
  const v = clampInt(volume, 1, LIBRARY.volumes);
  const babel = libraryFor(lang);
  const wanted = Array.from(new Set(pages.map((p) => clampInt(p, 1, LIBRARY.pages))));
  return NextResponse.json({
    title: babel.getTitle(`${hex}-${w}-${s}-${v}`),
    pages: wanted.map((page) => ({ page, content: babel.getPage(`${hex}-${w}-${s}-${v}-${page}`) })),
  });
}
