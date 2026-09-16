import { NextResponse } from "next/server";
import { libraryFor } from "@/lib/babel";
import { readJson } from "@/lib/api";

export async function POST(request: Request) {
  const parsed = await readJson<{ address?: unknown; lang?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { address, lang } = parsed.body;
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  return NextResponse.json({ title: libraryFor(lang).getTitle(address) });
}
