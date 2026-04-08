import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";

export async function POST(request: Request) {
  const { title } = await request.json();
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const babel = createBabel();
  const address = babel.searchTitle(title);
  return NextResponse.json({ address });
}
