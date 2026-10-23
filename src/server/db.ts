import postgres from "postgres";
import { fogFromBitString, fogToBitString } from "@/lib/online/fog";
import type { Anchor, ChatMessage, Note, SharedPlace } from "@/lib/online/protocol";
import { SCHEMA } from "./schema";
export const sql = postgres(process.env.DATABASE_URL ?? "postgres://babel:babel@localhost:5433/babel", { max: 5, onnotice: () => {} });
export async function migrate(): Promise<void> {
  await sql.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext('babel-schema'))`;
    await transaction.unsafe(SCHEMA);
  });
}
export async function loadGuest(id: string, fresh: () => { nick: string; color: string }): Promise<{ nick: string; color: string }> {
  const { nick, color } = fresh();
  const [row] = await sql<{ nick: string; color: string }[]>`insert into guests (id, nick, color) values (${id}, ${nick}, ${color}) on conflict (id) do update set id = excluded.id returning nick, color`;
  return row;
}
export async function saveProfile(id: string, nick: string, color: string): Promise<void> { await sql`update guests set nick = ${nick}, color = ${color} where id = ${id}`; }
export async function lastPlace(id: string, lang: string): Promise<{ cell: string; wall: number } | null> {
  const [row] = await sql<{ cell: string; wall: number }[]>`select cell, wall from positions where guest = ${id} and lang = ${lang}`;
  return row ?? null;
}
export async function savePlace(id: string, lang: string, cell: string, wall: number): Promise<void> {
  await sql`insert into positions (guest, lang, cell, wall) values (${id}, ${lang}, ${cell}, ${wall}) on conflict (guest, lang) do update set cell = excluded.cell, wall = excluded.wall, updated_at = now()`;
}
export async function loadFog(lang: string, chunks: string[]): Promise<Map<string, Uint8Array>> {
  if (!chunks.length) return new Map();
  const rows = await sql<{ chunk: string; bits: string }[]>`select chunk, bits::text as bits from fog where lang = ${lang} and chunk in ${sql(chunks)}`;
  return new Map(rows.map(row => [row.chunk, fogFromBitString(row.bits)]));
}
export async function addFog(lang: string, chunk: string, bits: Uint8Array): Promise<void> {
  await sql.begin(async transaction => {
    // Exact keys exceed B-tree limits; hash collisions only serialise unrelated updates.
    await transaction`select pg_advisory_xact_lock(hashtextextended(${lang + " " + chunk}, 0))`;
    const updated = await transaction`update fog set bits = bits | ${fogToBitString(bits)}::bit(1024) where lang = ${lang} and chunk = ${chunk} returning lang`;
    if (!updated.length) await transaction`insert into fog (lang, chunk, bits) values (${lang}, ${chunk}, ${fogToBitString(bits)}::bit(1024))`;
  });
}
type NoteRow = { id: string; chunk: string; cell: string; anchor: Anchor | null; text: string; author: string; nick: string; color: string; at: Date };
const toNote = (row: NoteRow): Note => ({ id: Number(row.id), cell: row.cell, anchor: row.anchor, text: row.text, author: row.author, nick: row.nick, color: row.color, at: row.at.toISOString() });
export async function addNote(lang: string, chunk: string, note: { cell: string; anchor: Anchor | null; text: string; author: string }): Promise<{ id: number; at: string }> {
  const [row] = await sql<{ id: string; at: Date }[]>`insert into notes (lang, chunk, cell, anchor, text, author) values (${lang}, ${chunk}, ${note.cell}, ${note.anchor ? sql.json({ ...note.anchor }) : null}, ${note.text}, ${note.author}) returning id, created_at as at`;
  return { id: Number(row.id), at: row.at.toISOString() };
}
/** Notes are permanent; a chunk response contains every live note, newest first. */
export async function notesIn(lang: string, chunks: string[]): Promise<Map<string, Note[]>> {
  const out = new Map<string, Note[]>();
  if (!chunks.length) return out;
  const rows = await sql<NoteRow[]>`select n.id, n.chunk, n.cell, n.anchor, n.text, n.author, g.nick, g.color, n.created_at as at from notes n join guests g on g.id = n.author where n.lang = ${lang} and n.chunk in ${sql(chunks)} and not n.forgotten order by n.id desc`;
  for (const row of rows) { const list = out.get(row.chunk) ?? []; list.push(toNote(row)); out.set(row.chunk, list); }
  return out;
}
export async function addMessage(lang: string, message: { author: string; text: string; place: SharedPlace | null }): Promise<{ id: number; at: string }> {
  return sql.begin(async transaction => {
    // Serialise retention per world so simultaneous writers cannot leave 201 rows behind.
    await transaction`select pg_advisory_xact_lock(hashtext(${lang}))`;
    const [row] = await transaction<{ id: string; at: Date }[]>`insert into messages (lang, author, text, place) values (${lang}, ${message.author}, ${message.text}, ${message.place ? transaction.json({ ...message.place }) : null}) returning id, created_at as at`;
    await transaction`delete from messages where lang = ${lang} and id not in (select id from messages where lang = ${lang} order by id desc limit 200)`;
    return { id: Number(row.id), at: row.at.toISOString() };
  });
}
export async function recentMessages(lang: string, limit = 200): Promise<ChatMessage[]> {
  const rows = await sql<{ id: string; author: string; nick: string; color: string; text: string; place: SharedPlace | null; at: Date }[]>`select m.id, m.author, g.nick, g.color, m.text, m.place, m.created_at as at from messages m join guests g on g.id = m.author where m.lang = ${lang} and not m.forgotten order by m.id desc limit ${Math.max(0, Math.min(200, Math.trunc(limit)))}`;
  return rows.reverse().map(row => ({ ...row, id: Number(row.id), at: row.at.toISOString() }));
}
const TABLE = { note: "notes", chat: "messages" } as const;
export async function authorOf(lang: string, kind: "note" | "chat", id: number): Promise<string | null> {
  const [row] = await sql<{ author: string }[]>`select author from ${sql(TABLE[kind])} where lang = ${lang} and id = ${id} and not forgotten`;
  return row?.author ?? null;
}
export async function forget(lang: string, kind: "note" | "chat", id: number): Promise<boolean> {
  const rows = await sql`update ${sql(TABLE[kind])} set forgotten = true where lang = ${lang} and id = ${id} and not forgotten returning id`;
  return rows.length > 0;
}
export async function addBan(guest: string, ip: string | null): Promise<void> { await sql`insert into bans (guest, ip) values (${guest}, ${ip})`; }
export async function loadBans(): Promise<{ guests: string[]; ips: string[] }> {
  const rows = await sql<{ guest: string | null; ip: string | null }[]>`select guest, ip from bans`;
  return { guests: rows.flatMap(row => row.guest ? [row.guest] : []), ips: rows.flatMap(row => row.ip ? [row.ip] : []) };
}
