import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const DIGS = "0123456789abcdefghijklmnopqrstuvwxyz";
const LENGTH_OF_PAGE = 4819;
const WALL = 5;
const SHELF = 7;
const VOLUME = 31;
const PAGE = 421;

function randomInt(max: number): number {
  const bytes = randomBytes(4);
  return (bytes.readUInt32BE(0) % max) + 1;
}

export async function GET() {
  // Generate random hex using crypto
  const bytes = randomBytes(LENGTH_OF_PAGE);
  let hex = "";
  for (let i = 0; i < LENGTH_OF_PAGE; i++) {
    hex += DIGS[bytes[i] % DIGS.length];
  }

  const wall = randomInt(WALL);
  const shelf = randomInt(SHELF);
  const volume = randomInt(VOLUME);
  const page = randomInt(PAGE);

  const address = `${hex}-${wall}-${shelf}-${volume}-${page}`;

  return NextResponse.json({ address });
}
