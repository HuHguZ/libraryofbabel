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
  const parts = address.split("-");
  if (parts.length < 5) {
    return NextResponse.json({ error: "invalid address format" }, { status: 400 });
  }
  const content = libraryFor(lang).getPage(address);
  return NextResponse.json({
    content,
    wall: Number(parts[1]),
    shelf: Number(parts[2]),
    volume: Number(parts[3]),
    page: Number(parts[4]),
  });
}
