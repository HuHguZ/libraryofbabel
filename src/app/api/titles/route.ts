import { NextResponse } from "next/server";
import { createBabel } from "@/lib/babel";
import { LIBRARY, clampInt, isValidHex } from "@/lib/library";

const babel = createBabel();

/** Titles of all volumes on one shelf: POST { hex, wall, shelf } → { titles: string[] } */
export async function POST(req: Request) {
  let body: { hex?: unknown; wall?: unknown; shelf?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isValidHex(body.hex)) {
    return NextResponse.json({ error: "invalid hex" }, { status: 400 });
  }
  const wall = clampInt(body.wall, 1, LIBRARY.walls);
  const shelf = clampInt(body.shelf, 1, LIBRARY.shelves);
  const titles = Array.from({ length: LIBRARY.volumes }, (_, i) =>
    babel.getTitle(`${body.hex}-${wall}-${shelf}-${i + 1}`)
  );
  return NextResponse.json({ titles });
}
