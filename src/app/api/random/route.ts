import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { DIGS, LIBRARY, MAX_ADDRESS_LENGTH } from "@/lib/library";

function randomInt(max: number): number {
  return (randomBytes(4).readUInt32BE(0) % max) + 1;
}

export async function GET() {
  const bytes = randomBytes(MAX_ADDRESS_LENGTH);
  let hex = "";
  for (let i = 0; i < MAX_ADDRESS_LENGTH; i++) {
    hex += DIGS[bytes[i] % DIGS.length];
  }
  const address = `${hex}-${randomInt(LIBRARY.walls)}-${randomInt(LIBRARY.shelves)}-${randomInt(LIBRARY.volumes)}-${randomInt(LIBRARY.pages)}`;
  return NextResponse.json({ address });
}
