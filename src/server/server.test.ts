// @vitest-environment node
import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { ServerMessage } from "@/lib/online/protocol";
import { createOnlineServer } from "./server";
import { signGuest } from "./guestToken";
import { sql } from "./db";
const integration = process.env.ONLINE_INTEGRATION === "1";
afterAll(async () => { await sql.end(); });
it.skipIf(!integration)("authenticates real sockets, persists fog/notes/chat, enforces authorship and bans upgrades", async () => {
  const server = await createOnlineServer({ secret: "integration-secret", adminToken: "integration-admin" });
  const guests = [randomUUID(), randomUUID(), randomUUID()];
  const sockets: WebSocket[] = [];
  await new Promise<void>(resolve => server.http.listen(0, "127.0.0.1", resolve));
  const address = server.http.address();
  if (!address || typeof address === "string") throw new Error("missing test port");
  const url = `ws://127.0.0.1:${address.port}`;
  const connect = async (guest: string, origin = "http://127.0.0.1:3000") => {
    const ws = new WebSocket(url, { origin, headers: { Cookie: `babel_guest=${signGuest(guest, "integration-secret")}` } });
    sockets.push(ws);
    const frames: ServerMessage[] = [];
    ws.on("message", data => frames.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    const wait = async (predicate: (message: ServerMessage) => boolean) => {
      const end = Date.now() + 3000;
      while (Date.now() < end) { const found = frames.find(predicate); if (found) return found; await new Promise(done => setTimeout(done, 10)); }
      throw new Error("expected online frame not received");
    };
    return { ws, frames, wait, send: (message: unknown) => ws.send(JSON.stringify(message)) };
  };
  try {
    await expect(connect(guests[0], "http://foreign.invalid")).rejects.toThrow("403");
    const a = await connect(guests[0]), b = await connect(guests[1]), admin = await connect(guests[2]);
    for (const [client, token] of [[a, undefined], [b, undefined], [admin, "integration-admin"]] as const) client.send({ type: "hello", lang: "ru", admin: token });
    await Promise.all([a.wait(m => m.type === "welcome"), b.wait(m => m.type === "welcome"), admin.wait(m => m.type === "welcome")]);
    a.send({ type: "pose", cell: "7:9", p: [0, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 } });
    expect(await b.wait(m => m.type === "fog")).toMatchObject({ key: "0:0", bit: 295 });
    a.send({ type: "chat", text: "integration greeting" });
    expect(await b.wait(m => m.type === "message" && m.message.author === guests[0])).toMatchObject({ message: { text: "integration greeting" } });
    a.send({ type: "note", cell: "7:9", anchor: null, text: "integration finding" });
    const noted = await b.wait(m => m.type === "noted" && m.note.author === guests[0]);
    if (noted.type !== "noted") throw new Error("missing note");
    b.send({ type: "watch", chunks: ["0:0"] });
    expect(await b.wait(m => m.type === "chunk")).toMatchObject({ notes: expect.arrayContaining([expect.objectContaining({ id: noted.note.id })]) });
    b.send({ type: "forget", kind: "note", id: noted.note.id });
    b.send({ type: "chat", text: "after forbidden delete" });
    await b.wait(m => m.type === "message" && m.message.author === guests[1]);
    expect(b.frames.some(m => m.type === "forgotten" && m.id === noted.note.id)).toBe(false);
    a.send({ type: "forget", kind: "note", id: noted.note.id });
    expect(await b.wait(m => m.type === "forgotten")).toMatchObject({ kind: "note", id: noted.note.id });
    await server.hub.flush();
    expect((await sql`select cell from positions where guest = ${guests[0]} and lang = 'ru'`)[0].cell).toBe("7:9");
    const closed = new Promise<number>(resolve => b.ws.once("close", resolve));
    admin.send({ type: "ban", guest: guests[1] });
    expect(await closed).toBe(4003);
    await expect(connect(guests[1])).rejects.toThrow("403");
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
    await sql`delete from bans where guest in ${sql(guests)}`;
    await sql`delete from notes where author in ${sql(guests)}`;
    await sql`delete from messages where author in ${sql(guests)}`;
    await sql`delete from positions where guest in ${sql(guests)}`;
    await sql`delete from guests where id in ${sql(guests)}`;
  }
}, 15000);
