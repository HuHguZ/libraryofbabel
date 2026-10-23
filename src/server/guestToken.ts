import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export const GUEST_COOKIE = "babel_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const mac = (id: string, secret: string) => createHmac("sha256", secret).update(id).digest("base64url");
export const newGuestId = (): string => randomUUID();
export const signGuest = (id: string, secret: string): string => `${id}.${mac(id, secret)}`;
export function verifyGuest(token: string | undefined, secret: string): string | null {
  if (!secret || !token || token.length > 100) return null;
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra !== undefined || !UUID.test(id)) return null;
  const want = Buffer.from(mac(id, secret));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}
