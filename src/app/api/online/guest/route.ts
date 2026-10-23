import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GUEST_COOKIE, newGuestId, signGuest, verifyGuest } from "@/server/guestToken";
export const runtime = "nodejs";
export async function POST() {
  const secret = process.env.GUEST_SECRET;
  if (!secret) return NextResponse.json({ online: false }, { status: 503 });
  const jar = await cookies();
  if (!verifyGuest(jar.get(GUEST_COOKIE)?.value, secret)) jar.set(GUEST_COOKIE, signGuest(newGuestId(), secret), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  return NextResponse.json({ online: true });
}
