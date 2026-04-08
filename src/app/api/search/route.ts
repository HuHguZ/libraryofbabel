import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";

export async function POST(request: Request) {
  const { text } = await request.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const babel = createBabel();
  const address = babel.search(text);
  return NextResponse.json({ address });
}
