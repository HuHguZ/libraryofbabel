import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";

export async function POST(request: Request) {
  const { address } = await request.json();
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const parts = address.split("-");
  if (parts.length < 5) {
    return NextResponse.json({ error: "invalid address format" }, { status: 400 });
  }
  const babel = createBabel();
  const content = babel.getPage(address);
  return NextResponse.json({
    content,
    wall: Number(parts[1]),
    shelf: Number(parts[2]),
    volume: Number(parts[3]),
    page: Number(parts[4]),
  });
}
