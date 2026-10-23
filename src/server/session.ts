import { locales, type Locale } from "@/i18n/locales";
import { emptyFog, fogToBase64 } from "@/lib/online/fog";
import { cleanText, MAX_FRAME, parseClientMessage, type ClientMessage, type Pose, type ServerMessage } from "@/lib/online/protocol";
import { chunkKeyOf, parseCellKey } from "@/lib/world";
import type * as db from "./db";
import { FogBook } from "./fog";
import { RateLimits } from "./limits";
import { Bans, canForget } from "./moderation";
import { randomColor, randomNick } from "./nicks";
import { World } from "./world";

export type Storage = Pick<typeof db, "loadGuest" | "lastPlace" | "saveProfile" | "savePlace" | "loadFog" | "addFog" | "notesIn" | "recentMessages" | "addMessage" | "addNote" | "authorOf" | "forget" | "addBan">;
type PendingPlace = { guest: string; lang: Locale; cell: string; wall: number };

/** One process owns both worlds; the transport only supplies authenticated guest ids. */
export class OnlineHub {
  readonly worlds = new Map<Locale, World>(locales.map(lang => [lang, new World()]));
  readonly clients = new Set<Session>();
  readonly fog = new FogBook();
  readonly limits = new RateLimits();
  private readonly pendingPlaces = new Map<string, PendingPlace>();
  private flushing: Promise<void> | null = null;
  constructor(readonly database: Storage, readonly adminToken: string, readonly bans = new Bans()) {}
  connect(guest: string, ip: string, send: (message: ServerMessage) => void, close: (code: number) => void): Session {
    const session = new Session(this, guest, ip, send, close); this.clients.add(session); return session;
  }
  broadcast(lang: Locale, message: ServerMessage): void { for (const client of this.clients) client.broadcast(lang, message); }
  tick(): void { for (const [lang, world] of this.worlds) { const moves = world.takeMoves(); if (moves) this.broadcast(lang, moves); } }
  roster(): void { for (const [lang, world] of this.worlds) this.broadcast(lang, world.roster()); }
  remember(guest: string, lang: Locale, pose: Pose): void { this.pendingPlaces.set(`${guest} ${lang}`, { guest, lang, cell: pose.cell, wall: pose.view.wall || 1 }); }
  async flush(): Promise<void> {
    if (this.flushing) { await this.flushing; return this.flush(); }
    this.flushing = this.flushPending();
    try { await this.flushing; } finally { this.flushing = null; }
  }
  private async flushPending(): Promise<void> {
    let error: unknown;
    try { await this.fog.flush((...args) => this.database.addFog(...args)); } catch (failure) { error = failure; }
    for (const [key, entry] of this.pendingPlaces) {
      try {
        await this.database.savePlace(entry.guest, entry.lang, entry.cell, entry.wall);
        if (this.pendingPlaces.get(key) === entry) this.pendingPlaces.delete(key);
      } catch (failure) { error = failure; }
    }
    if (error) throw error;
  }
}

export class Session {
  lang: Locale | null = null;
  nick = "";
  color = "";
  admin = false;
  joined = false;
  closed = false;
  private chain = Promise.resolve();
  private queued = 0;
  private snapshot: { lang: Locale; kind: "hello" | "watch"; events: ServerMessage[] } | null = null;
  constructor(private readonly hub: OnlineHub, readonly guest: string, readonly ip: string, readonly send: (message: ServerMessage) => void, private readonly disconnect: (code: number) => void) {}
  broadcast(lang: Locale, message: ServerMessage): void {
    if (this.closed) return;
    const snapshot = this.snapshot;
    const buffered = snapshot?.kind === "hello"
      ? message.type === "message" || (message.type === "forgotten" && message.kind === "chat")
      : message.type === "noted" || (message.type === "forgotten" && message.kind === "note");
    if (snapshot?.lang === lang && buffered) {
      if (snapshot.events.length >= 1024) { this.disconnect(1013); this.close(); }
      else snapshot.events.push(message);
    } else if (this.lang === lang) this.send(message);
  }
  private finishSnapshot(): void {
    const events = this.snapshot?.events ?? [];
    this.snapshot = null;
    if (!this.closed) for (const event of events) this.send(event);
  }
  receive(raw: string): Promise<void> {
    if (this.closed || raw.length > MAX_FRAME) return Promise.resolve();
    const message = parseClientMessage(raw);
    if (!message) {
      try {
        const value = JSON.parse(raw);
        if (value && (value.type === "chat" || value.type === "note") && !cleanText(value.text)) this.send({ type: "refused", reason: "length" });
      } catch { /* Invalid frames are dropped. */ }
      return Promise.resolve();
    }
    // Bound queued asynchronous DB work even when a sender ignores all rate limits.
    if (this.queued >= 64) { this.refuse("rate"); return this.chain; }
    this.queued++;
    this.chain = this.chain.then(async () => {
      if (!this.closed) await this.handle(message);
    }).catch(() => { if (!this.closed) { this.disconnect(1011); this.close(); } }).finally(() => { this.queued--; });
    return this.chain;
  }
  private refuse(reason: "rate" | "length" | "banned" | "invalid"): void { this.send({ type: "refused", reason }); }
  private allowed(kind: Parameters<RateLimits["take"]>[0], silent = false): boolean {
    if (this.hub.limits.take(kind, this.guest, this.ip)) return true;
    if (!silent) this.refuse("rate");
    return false;
  }
  private async handle(message: ClientMessage): Promise<void> {
    const { database, bans } = this.hub;
    if (bans.has(this.guest, this.ip)) { this.refuse("banned"); return; }
    if (message.type === "hello") {
      if (this.lang) return;
      this.snapshot = { lang: message.lang, kind: "hello", events: [] };
      const { nick, color } = await database.loadGuest(this.guest, () => ({ nick: randomNick(message.lang), color: randomColor() }));
      const [last, history] = await Promise.all([database.lastPlace(this.guest, message.lang), database.recentMessages(message.lang)]);
      if (this.closed || bans.has(this.guest, this.ip)) return;
      Object.assign(this, { lang: message.lang, nick, color, admin: this.hub.adminToken !== "" && message.admin === this.hub.adminToken });
      this.send({ type: "welcome", you: { id: this.guest, nick, color }, last, admin: this.admin });
      this.send(this.hub.worlds.get(message.lang)!.roster());
      this.send({ type: "history", messages: history });
      this.finishSnapshot();
      return;
    }
    const lang = this.lang;
    if (!lang) { this.disconnect(4002); this.close(); return; }
    const world = this.hub.worlds.get(lang)!;
    if (message.type === "pose") {
      if (!this.allowed("pose", true)) return;
      const pose: Pose = { cell: message.cell, p: message.p, yaw: message.yaw, view: message.view };
      if (!this.joined) { this.joined = true; world.join({ id: this.guest, nick: this.nick, color: this.color, ...pose }); this.hub.broadcast(lang, world.roster()); }
      else world.move(this.guest, pose);
      this.hub.remember(this.guest, lang, pose);
      const marked = this.hub.fog.mark(lang, parseCellKey(pose.cell)!);
      if (marked) this.hub.broadcast(lang, { type: "fog", ...marked });
      return;
    }
    if (message.type === "profile") {
      if (!this.allowed("profile")) return;
      const nick = message.nick ?? this.nick, color = message.color ?? this.color;
      await database.saveProfile(this.guest, nick, color);
      for (const client of this.hub.clients) if (client.guest === this.guest) Object.assign(client, { nick, color });
      for (const [language, target] of this.hub.worlds) { target.rename(this.guest, nick, color); this.hub.broadcast(language, target.roster()); }
      // A profile can be edited before the first pose, so its owner also needs an acknowledgement.
      this.send({ type: "welcome", you: { id: this.guest, nick, color }, last: await database.lastPlace(this.guest, lang), admin: this.admin });
      return;
    }
    if (message.type === "watch") {
      if (!this.allowed("watch")) return;
      this.snapshot = { lang, kind: "watch", events: [] };
      const [found, notes] = await Promise.all([database.loadFog(lang, message.chunks), database.notesIn(lang, message.chunks)]);
      if (this.closed) return;
      for (const key of message.chunks) this.send({ type: "chunk", key, fog: fogToBase64(this.hub.fog.mergeSeen(lang, key, found.get(key) ?? emptyFog())), notes: notes.get(key) ?? [] });
      this.finishSnapshot();
      return;
    }
    if (message.type === "chat") {
      if (!this.allowed("chat")) return;
      const place = message.place ?? null;
      const { id, at } = await database.addMessage(lang, { author: this.guest, text: message.text, place });
      this.hub.broadcast(lang, { type: "message", message: { id, at, author: this.guest, nick: this.nick, color: this.color, text: message.text, place } });
      return;
    }
    if (message.type === "note") {
      if (!this.allowed("note")) return;
      const chunk = chunkKeyOf(parseCellKey(message.cell)!);
      const { id, at } = await database.addNote(lang, chunk, { cell: message.cell, anchor: message.anchor, text: message.text, author: this.guest });
      this.hub.broadcast(lang, { type: "noted", note: { id, at, cell: message.cell, anchor: message.anchor, text: message.text, author: this.guest, nick: this.nick, color: this.color } });
      return;
    }
    if (message.type === "forget") {
      if (!this.allowed("mod")) return;
      if (!canForget(await database.authorOf(lang, message.kind, message.id), this.guest, this.admin)) return;
      if (await database.forget(lang, message.kind, message.id)) this.hub.broadcast(lang, { type: "forgotten", kind: message.kind, id: message.id });
      return;
    }
    if (message.type === "ban") {
      if (!this.admin || message.guest === this.guest || !this.allowed("mod")) return;
      const targets = [...this.hub.clients].filter(client => client.guest === message.guest);
      const ips = [...new Set(targets.map(client => client.ip).filter(Boolean))];
      if (!ips.length) await database.addBan(message.guest, null);
      else for (const ip of ips) await database.addBan(message.guest, ip);
      bans.add(message.guest, null); for (const ip of ips) bans.add(message.guest, ip);
      for (const client of [...this.hub.clients]) if (bans.has(client.guest, client.ip)) { client.refuse("banned"); client.disconnect(4003); client.close(); }
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.snapshot = null; this.hub.clients.delete(this);
    if (this.lang && this.joined) {
      const world = this.hub.worlds.get(this.lang)!;
      if (world.leave(this.guest)) this.hub.broadcast(this.lang, { type: "left", id: this.guest });
      this.hub.broadcast(this.lang, world.roster());
    }
  }
}
