import { MAX_FRAME, MAX_WATCH, type ActivityMessage, type ChatMessage, type ClientMessage, type Note, type Player, type Pose, type ServerMessage } from "@/lib/online/protocol";
import { fogFromBase64, setBit } from "@/lib/online/fog";
import { cellKey, chunkKeyOf, parseCellKey, type Cell } from "@/lib/world";
import { addSample, type Track } from "./presence";

export type OnlineStatus = "connecting" | "online" | "offline";
export interface OnlineSnapshot {
  status: OnlineStatus;
  you: { id: string; nick: string; color: string } | null;
  last: { cell: string; wall: number } | null;
  admin: boolean;
  players: ReadonlyMap<string, Player>;
  messages: (ChatMessage | ActivityMessage)[];
  notesVersion: number;
  selectionsVersion: number;
  refused: { reason: string; at: number } | null;
}
export interface OnlineStore {
  getSnapshot(): OnlineSnapshot;
  getServerSnapshot(): OnlineSnapshot;
  subscribe(listener: () => void): () => void;
  setStatus(status: OnlineStatus): void;
  receive(message: ServerMessage, now?: number): void;
  send(message: ClientMessage): void;
  reconnect(): void;
  tracks: Map<string, Track>;
  chunks: Map<string, Uint8Array>;
  notes: Map<string, Note[]>;
  watch(keys: string[]): void;
  notesAt(cell: Cell): Note[];
}

export function createOnlineStore(): OnlineStore {
  let snapshot: OnlineSnapshot = { status: "connecting", you: null, last: null, admin: false, players: new Map(), messages: [], notesVersion: 0, selectionsVersion: 0, refused: null };
  const serverSnapshot = snapshot;
  const listeners = new Set<() => void>();
  const tracks = new Map<string, Track>();
  const chunks = new Map<string, Uint8Array>();
  const notes = new Map<string, Note[]>();
  const asked = new Set<string>();
  const wanted = new Set<string>();
  const set = (next: Partial<OnlineSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const track = (id: string, pose: Pose, now: number): boolean => {
    const cell = parseCellKey(pose.cell);
    if (!cell) return false;
    let samples = tracks.get(id);
    if (!samples) tracks.set(id, (samples = []));
    const previous = samples.at(-1);
    const changed = JSON.stringify(previous?.reading?.fragment) !== JSON.stringify(pose.reading?.fragment) ||
      (!!pose.reading?.fragment && !!previous && (cellKey(previous.cell) !== pose.cell || JSON.stringify(previous.view) !== JSON.stringify(pose.view)));
    addSample(samples, { t: now, cell, p: pose.p, yaw: pose.yaw, view: pose.view, reading: pose.reading });
    return changed;
  };
  const store: OnlineStore = {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setStatus(status) {
      if (status === snapshot.status) return;
      if (status !== "offline") return set({ status });
      const selectionsVersion = snapshot.selectionsVersion + ([...tracks.values()].some(samples => samples.at(-1)?.reading?.fragment) ? 1 : 0);
      tracks.clear(); chunks.clear(); notes.clear(); asked.clear();
      set({ status, you: null, last: null, admin: false, players: new Map(), messages: [], refused: null, notesVersion: snapshot.notesVersion + 1, selectionsVersion });
    },
    receive(m, now = performance.now()) {
      const me = snapshot.you?.id;
      switch (m.type) {
        case "welcome":
          if (snapshot.status === "online" && snapshot.you?.id === m.you.id) {
            set({ you: m.you, admin: m.admin });
            return;
          }
          asked.clear();
          set({ status: "online", you: m.you, last: m.last, admin: m.admin });
          store.watch([...wanted]);
          return;
        case "players": {
          const self = m.list.find((player) => player.id === me);
          const players = new Map(m.list.filter((player) => player.id !== me).map((player) => [player.id, player]));
          let changed = false;
          for (const player of players.values()) if (track(player.id, player, now)) changed = true;
          for (const [id, samples] of tracks) if (!players.has(id)) {
            if (samples.at(-1)?.reading?.fragment) changed = true;
            tracks.delete(id);
          }
          set({ players, selectionsVersion: snapshot.selectionsVersion + (changed ? 1 : 0), ...(self && { you: { id: self.id, nick: self.nick, color: self.color } }) });
          return;
        }
        case "poses": {
          let changed = false;
          for (const pose of m.list) if (pose.id !== me && snapshot.players.has(pose.id) && track(pose.id, pose, now)) changed = true;
          if (changed) set({ selectionsVersion: snapshot.selectionsVersion + 1 });
          return;
        }
        case "left": {
          const changed = !!tracks.get(m.id)?.at(-1)?.reading?.fragment;
          tracks.delete(m.id);
          const players = new Map(snapshot.players);
          players.delete(m.id);
          set({ players, selectionsVersion: snapshot.selectionsVersion + (changed ? 1 : 0) });
          return;
        }
        case "chunk":
          chunks.set(m.key, fogFromBase64(m.fog));
          notes.set(m.key, m.notes);
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        case "fog": {
          const bits = chunks.get(m.key);
          if (bits) setBit(bits, m.bit);
          return;
        }
        case "noted": {
          const cell = parseCellKey(m.note.cell);
          if (!cell) return;
          const key = chunkKeyOf(cell);
          const list = notes.get(key);
          if (!list) return;
          notes.set(key, [m.note, ...list.filter((note) => note.id !== m.note.id)]);
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        }
        case "painted":
          for (const [key, list] of notes) notes.set(key, list.map(note => note.id === m.id ? { ...note, highlightColor: m.color } : note));
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        case "forgotten":
          if (m.kind === "chat") return set({ messages: snapshot.messages.filter((message) => message.id !== m.id) });
          for (const [key, list] of notes) notes.set(key, list.filter((note) => note.id !== m.id));
          set({ notesVersion: snapshot.notesVersion + 1 });
          return;
        case "history":
          set({ messages: m.messages.slice(-200) });
          return;
        case "message":
          set({ messages: [...snapshot.messages.filter((message) => message.id !== m.message.id), m.message].slice(-200) });
          return;
        case "activity":
          set({ messages: [...snapshot.messages.filter((message) => message.id !== m.activity.id), m.activity].slice(-200) });
          return;
        case "refused":
          set({ refused: { reason: m.reason, at: now } });
      }
    },
    watch(keys) {
      keys.forEach((key) => wanted.add(key));
      if (snapshot.status !== "online") return;
      const fresh = [...new Set(keys)].filter((key) => !asked.has(key));
      let batch: string[] = [];
      let bytes = 32;
      const flush = () => {
        if (!batch.length) return;
        batch.forEach((key) => asked.add(key));
        store.send({ type: "watch", chunks: batch });
        batch = []; bytes = 32;
      };
      for (const key of fresh) {
        // Decimal keys can be thousands of bytes far from the centre.
        if (batch.length === MAX_WATCH || bytes + key.length + 3 > MAX_FRAME) flush();
        batch.push(key); bytes += key.length + 3;
      }
      flush();
    },
    notesAt: (cell) => (notes.get(chunkKeyOf(cell)) ?? []).filter((note) => note.cell === cellKey(cell)),
    send: () => {}, reconnect: () => {}, tracks, chunks, notes,
  };
  return store;
}
