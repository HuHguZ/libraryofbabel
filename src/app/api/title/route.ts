import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";

export async function POST(request: Request) {
  const { address } = await request.json();
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const babel = createBabel();
  const title = babel.getTitle(address);
  return NextResponse.json({ title });
}
