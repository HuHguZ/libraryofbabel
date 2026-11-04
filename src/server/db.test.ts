// @vitest-environment node
import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as db from "./db";
import { emptyFog, hasBit, setBit } from "@/lib/online/fog";
import { cellKey, cellOf, chunkKeyOf } from "@/lib/world";
const integration = process.env.ONLINE_INTEGRATION === "1";
const lang = `test-${randomUUID()}`;
const guest = randomUUID();
it.skipIf(!integration)("persists highlight colours and only lets the author repaint a live anchored note", async () => {
  await db.migrate();
  await db.loadGuest(guest, () => ({ nick: "Test reader", color: "#b02e3a" }));
  const anchor = { wall: 1, shelf: 2, volume: 3, page: 4, start: 10, end: 30 };
  const mark = await db.addNote(lang, "0:0", { cell: "0:0", anchor, text: "", author: guest, highlightColor: "#3a6fc4" });
  await db.migrate();
  expect(await db.noteById(lang, mark.id)).toMatchObject({ anchor, highlightColor: "#3a6fc4" });
  expect(await db.paintNote(lang, mark.id, randomUUID(), "#4f9a5a")).toBe(false);
  expect(await db.paintNote("other", mark.id, guest, "#4f9a5a")).toBe(false);
  expect(await db.noteById("other", mark.id)).toBeNull();
  expect(await db.paintNote(lang, mark.id, guest, "#4f9a5a")).toBe(true);
  expect((await db.notesIn(lang, ["0:0"])).get("0:0")?.find(n => n.id === mark.id)).toMatchObject({ highlightColor: "#4f9a5a" });
  await db.forget(lang, "note", mark.id);
  expect(await db.paintNote(lang, mark.id, guest, "#b02e3a")).toBe(false);
});
afterAll(async () => {
  if (integration) {
    await db.sql`delete from notes where lang = ${lang}`;
    await db.sql`delete from messages where lang = ${lang}`;
    await db.sql`delete from fog where lang = ${lang}`;
    await db.sql`delete from positions where guest = ${guest}`;
    await db.sql`delete from guests where id = ${guest}`;
  }
  await db.sql.end();
});
it.skipIf(!integration)("persists world-isolated places, fog, notes and only the last 200 chats", async () => {
  await db.migrate();
  expect(await db.loadGuest(guest, () => ({ nick: "Test reader", color: "#b02e3a" }))).toEqual({ nick: "Test reader", color: "#b02e3a" });
  await db.savePlace(guest, lang, "-1:2", 4);
  expect(await db.lastPlace(guest, lang)).toEqual({ cell: "-1:2", wall: 4 });
  expect(await db.lastPlace(guest, "other")).toBeNull();
  const first = emptyFog(), second = emptyFog(); setBit(first, 0); setBit(second, 1023);
  await db.addFog(lang, "0:0", first); await db.addFog(lang, "0:0", second);
  const fog = (await db.loadFog(lang, ["0:0"])).get("0:0")!;
  expect(hasBit(fog, 0) && hasBit(fog, 1023)).toBe(true);
  const note = await db.addNote(lang, "0:0", { cell: "1:2", anchor: null, text: "finding", author: guest });
  expect((await db.notesIn(lang, ["0:0"])).get("0:0")?.[0]).toMatchObject({ id: note.id, text: "finding" });
  expect((await db.notesIn("other", ["0:0"])).size).toBe(0);
  expect(await db.authorOf("other", "note", note.id)).toBeNull();
  expect(await db.forget("other", "note", note.id)).toBe(false);
  expect(await db.authorOf(lang, "note", note.id)).toBe(guest);
  expect(await db.forget(lang, "note", note.id)).toBe(true);
  expect(await db.authorOf(lang, "note", note.id)).toBeNull();
  for (let i = 0; i < 201; i++) await db.addMessage(lang, { author: guest, text: `line ${i}`, place: null });
  const history = await db.recentMessages(lang);
  expect(history).toHaveLength(200);
  expect(history[0].text).toBe("line 1");
  expect(history[199].text).toBe("line 200");
  expect((await db.sql`select count(*)::int as n from messages where lang = ${lang}`)[0].n).toBe(200);
}, 30000);
it.skipIf(!integration)("preserves exact far-cell keys, concurrent fog ORs and notes across repeat migrations", async () => {
  await db.migrate();
  await db.loadGuest(guest, () => ({ nick: "Test reader", color: "#b02e3a" }));
  const cell = cellOf("babel"), chunk = chunkKeyOf(cell);
  expect(chunk.length).toBeGreaterThan(8191);
  await Promise.all([0, 3, 1023].map(async bit => { const bits = emptyFog(); setBit(bits, bit); await db.addFog(lang, chunk, bits); }));
  const note = await db.addNote(lang, chunk, { cell: cellKey(cell), anchor: null, text: "far finding", author: guest });
  await db.migrate();
  const fog = (await db.loadFog(lang, [chunk])).get(chunk)!;
  expect([0, 3, 1023].map(bit => hasBit(fog, bit))).toEqual([true, true, true]);
  expect((await db.sql`select count(*)::int as n from fog where lang = ${lang} and chunk = ${chunk}`)[0].n).toBe(1);
  expect((await db.notesIn(lang, [chunk])).get(chunk)?.[0]).toMatchObject({ id: note.id, cell: cellKey(cell), text: "far finding" });
  expect((await db.notesIn("other", [chunk])).size).toBe(0);
  // A separate exact key must not inherit another chunk's bits or notes.
  expect((await db.loadFog(lang, [chunk + "0"])).size).toBe(0);
  expect((await db.notesIn(lang, [chunk + "0"])).size).toBe(0);
}, 30000);
