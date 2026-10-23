import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { MAX_FRAME } from "@/lib/online/protocol";
import * as database from "./db";
import { GUEST_COOKIE, readCookie, verifyGuest } from "./guestToken";
import { Bans } from "./moderation";
import { sameHost } from "./security";
import { OnlineHub } from "./session";

export async function createOnlineServer(options: { secret: string; adminToken?: string; trustProxy?: boolean }) {
  if (!options.secret) throw new Error("GUEST_SECRET is not set: copy .env.example to .env.local");
  await database.migrate();
  const hub = new OnlineHub(database, options.adminToken ?? "", new Bans(await database.loadBans()));
  const http = createServer((_, response) => response.writeHead(426).end("This port speaks WebSocket only."));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
  const ipOf = (request: IncomingMessage) => {
    const forwarded = options.trustProxy ? request.headers["x-forwarded-for"]?.toString().split(",")[0] : undefined;
    return (forwarded ?? request.socket.remoteAddress ?? "").trim();
  };
  http.on("upgrade", (request, socket, head) => {
    const guest = verifyGuest(readCookie(request.headers.cookie, GUEST_COOKIE), options.secret), ip = ipOf(request);
    if (!guest || !sameHost(request.headers.origin, request.headers.host) || hub.bans.has(guest, ip)) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    wss.handleUpgrade(request, socket, head, ws => {
      const client = hub.connect(guest, ip, message => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > 1024 * 1024) { ws.close(4008, "slow connection"); return; }
        ws.send(JSON.stringify(message));
      }, code => ws.close(code));
      let alive = true;
      const helloTimeout = setTimeout(() => { if (!client.lang) ws.close(4002, "hello required"); }, 10000);
      const heartbeat = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 30000);
      ws.on("pong", () => { alive = true; });
      ws.on("message", (data, binary) => { if (!binary) void client.receive(data.toString()); });
      ws.on("error", () => { ws.terminate(); });
      ws.on("close", () => { clearTimeout(helloTimeout); clearInterval(heartbeat); client.close(); });
    });
  });
  const timers = [
    setInterval(() => hub.tick(), 100),
    setInterval(() => {
      hub.roster();
      void hub.flush().catch(() => {
        console.error("online persistence failed; pending writes retained");
        for (const ws of wss.clients) ws.close(1011, "database unavailable");
      });
    }, 2000),
    setInterval(() => hub.limits.prune(), 60000),
  ];
  const close = async () => {
    for (const timer of timers) clearInterval(timer);
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>(resolve => http.close(() => resolve()));
    await hub.flush();
  };
  return { http, hub, close };
}
