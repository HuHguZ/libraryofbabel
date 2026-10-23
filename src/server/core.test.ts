// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGuestId, readCookie, signGuest, verifyGuest } from "./guestToken";
import { Bucket, RateLimits } from "./limits";
import { randomColor, randomNick } from "./nicks";
import { World } from "./world";
import { Bans, canForget } from "./moderation";
import { FogBook } from "./fog";
import { hasBit } from "@/lib/online/fog";
import { cleanNick, PLAYER_COLORS } from "@/lib/online/protocol";
import { sameHost } from "./security";
describe("signed guest cookies", () => {
  it("rejects altered, foreign, malformed and missing tokens", () => {
    const id = newGuestId();
    const token = signGuest(id, "test-secret");
    expect(verifyGuest(token, "test-secret")).toBe(id);
    for (const bad of [undefined, "", `${id}.forged`, token + ".extra", token.replace(id, newGuestId()), "not-a-uuid.signature"]) expect(verifyGuest(bad, "test-secret")).toBeNull();
    expect(verifyGuest(token, "foreign")).toBeNull();
    expect(verifyGuest(signGuest(id, ""), "")).toBeNull();
    expect(readCookie("a=1; babel_guest=x.y; b=2", "babel_guest")).toBe("x.y");
    expect(readCookie("babel_guest=%broken", "babel_guest")).toBeUndefined();
  });
  it("requires the browser's own host, including IPv6", () => {
    expect(sameHost("http://localhost:3000", "localhost:3001")).toBe(true);
    expect(sameHost("http://[::1]:3000", "[::1]:3001")).toBe(true);
    for (const origin of [undefined, "null", "https://evil.example", "file://localhost/path"]) expect(sameHost(origin, "localhost:3001")).toBe(false);
  });
});
describe("rate limits", () => {
  it("refills without exceeding burst or losing tokens when time moves back", () => {
    let time = 0;
    const bucket = new Bucket(0.5, 2, () => time);
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
    time = 1000; expect(bucket.take()).toBe(false);
    time = 2000; expect(bucket.take()).toBe(true);
    time = -100; expect(bucket.take()).toBe(false);
    time = 2000; expect(bucket.take()).toBe(false);
    time = 100000; expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
  });
  it("shares limits across tabs, cookies and worlds", () => {
    const limits = new RateLimits(() => 0);
    for (let i = 0; i < 5; i++) expect(limits.take("chat", "a", "ip")).toBe(true);
    expect(limits.take("chat", "a", "new-ip")).toBe(false);
    expect(limits.take("chat", "new-guest", "ip")).toBe(false);
  });
});
it("generates valid localised nicks and palette colours", () => {
  for (const lang of ["ru", "en"] as const) for (let i = 0; i < 100; i++) {
    expect(cleanNick(randomNick(lang))).not.toBeNull();
    expect(PLAYER_COLORS).toContain(randomColor());
  }
});
it("keeps a guest present until the last tab closes and never replays departed moves", () => {
  const world = new World();
  const player = { id: "a", nick: "Reader", color: "#b02e3a", cell: "0:0", p: [0, 1.6, 0] as [number, number, number], yaw: 0, view: { kind: "walk" as const, wall: 1 } };
  expect(world.join(player)).toBe(true);
  expect(world.join({ ...player, p: [3, 1.6, 0] })).toBe(false);
  world.takeMoves();
  world.move("a", { ...player, cell: "2:0" });
  expect(world.takeMoves()).toMatchObject({ type: "poses", list: [{ id: "a", cell: "2:0" }] });
  expect(world.takeMoves()).toBeNull();
  expect(world.leave("a")).toBe(false);
  world.rename("a", "New reader", "#00ff00");
  expect(world.players.get("a")?.nick).toBe("New reader");
  expect(world.leave("a")).toBe(true);
  expect(world.takeMoves()).toBeNull();
});
it("allows authors/admins to forget and blocks guest or IP bans", () => {
  expect(canForget("a", "a", false)).toBe(true);
  expect(canForget("a", "b", true)).toBe(true);
  expect(canForget("a", "b", false)).toBe(false);
  expect(canForget(null, "b", true)).toBe(false);
  const bans = new Bans(); bans.add("a", "ip"); bans.add("b", "");
  expect(bans.has("a", "other")).toBe(true);
  expect(bans.has("c", "ip")).toBe(true);
  expect(bans.has("c", "")).toBe(false);
});
it("retains failed fog batches and merges moves arriving during a write", async () => {
  const book = new FogBook();
  expect(book.mark("ru", { x: -1n, floor: -1n })).toEqual({ key: "-1:-1", bit: 1023 });
  expect(book.mark("ru", { x: -1n, floor: -1n })).toBeNull();
  expect(book.mark("en", { x: -1n, floor: -1n })).not.toBeNull();
  await expect(book.flush(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  const saved: string[] = [];
  await book.flush(async (lang, chunk, bits) => { expect(hasBit(bits, 1023)).toBe(true); saved.push(`${lang} ${chunk}`); book.mark(lang, { x: -2n, floor: -1n }); });
  expect(saved).toEqual(["ru -1:-1", "en -1:-1"]);
  const pending = book.takePending();
  expect(pending).toHaveLength(2);
  expect(hasBit(pending[0].bits, 1022)).toBe(true);
  expect(book.takePending()).toEqual([]);
});
