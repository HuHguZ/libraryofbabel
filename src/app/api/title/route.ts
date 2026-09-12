import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";
import { readJson } from "@/lib/api";

const babel = createBabel();

export async function POST(request: Request) {
  const parsed = await readJson<{ address?: unknown }>(request);
  if ("error" in parsed) return parsed.error;
  const { address } = parsed.body;
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  return NextResponse.json({ title: babel.getTitle(address) });
}
