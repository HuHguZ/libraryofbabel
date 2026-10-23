"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { defaultLocale, isLocale } from "@/i18n/locales";
import type { ClientMessage, ServerMessage } from "@/lib/online/protocol";
import { createOnlineStore, type OnlineSnapshot, type OnlineStore } from "./onlineStore";

const OnlineContext = createContext<OnlineStore | null>(null);
let sessionAdmin: string | undefined;
export function rememberAdmin(token?: string) {
  sessionAdmin = token;
  try {
    if (token) localStorage.setItem("babel:admin", token);
    else localStorage.removeItem("babel:admin");
  } catch { /* Private browsing can disable storage. */ }
}
function adminToken(): string | undefined {
  try { return sessionAdmin ?? localStorage.getItem("babel:admin") ?? undefined; }
  catch { return sessionAdmin; }
}

/** One connection per tab; an unreachable server leaves the existing solo Library usable. */
export function OnlineProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const store = useMemo(() => {
    void locale;
    return createOnlineStore();
  }, [locale]);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let watchTimer: ReturnType<typeof setTimeout> | undefined;
    let watchQueue: Extract<ClientMessage, { type: "watch" }>[] = [];
    const controller = new AbortController();
    const again = () => {
      clearTimeout(watchdog);
      clearTimeout(watchTimer);
      watchTimer = undefined;
      watchQueue = [];
      store.send = () => {};
      store.setStatus("offline");
      if (!stopped) timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(retry++, 5)));
    };
    async function open() {
      if (stopped) return;
      store.setStatus("connecting");
      try {
        const res = await fetch("/api/online/guest", { method: "POST", signal: controller.signal });
        if (!res.ok) return again();
        if (stopped) return;
        const fallback = new URL(location.href);
        fallback.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        fallback.port = "3001";
        fallback.pathname = "/"; fallback.search = ""; fallback.hash = "";
        const socket = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || fallback.href);
        ws = socket;
        watchdog = setTimeout(() => socket.close(), 5000);
        const flushWatch = () => {
          watchTimer = undefined;
          const next = watchQueue.shift();
          if (!next || socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify(next));
          watchTimer = setTimeout(flushWatch, 300);
        };
        socket.onopen = () => {
          if (stopped || ws !== socket) return socket.close();
          const admin = adminToken();
          const hello: ClientMessage = { type: "hello", lang: isLocale(locale) ? locale : defaultLocale, ...(admin && { admin }) };
          socket.send(JSON.stringify(hello));
          store.send = (message) => {
            if (socket.readyState !== WebSocket.OPEN) return;
            if (message.type === "watch") {
              watchQueue.push(message);
              if (!watchTimer) flushWatch();
            } else socket.send(JSON.stringify(message));
          };
          store.reconnect = () => socket.close();
        };
        socket.onmessage = (event) => {
          if (stopped || ws !== socket) return;
          try {
            const message = JSON.parse(event.data as string) as ServerMessage;
            if (message.type === "welcome") { retry = 0; clearTimeout(watchdog); }
            store.receive(message);
          } catch { /* Ignore malformed frames; walking stays available. */ }
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => { if (!stopped && ws === socket) again(); };
      } catch { if (!stopped) again(); }
    }
    void open();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer); clearTimeout(watchdog); clearTimeout(watchTimer);
      ws?.close();
      store.send = () => {}; store.reconnect = () => {};
      store.setStatus("offline");
    };
  }, [store, locale]);
  return <OnlineContext.Provider value={store}>{children}</OnlineContext.Provider>;
}
export function useOnlineStore(): OnlineStore {
  const store = useContext(OnlineContext);
  if (!store) throw new Error("useOnlineStore outside OnlineProvider");
  return store;
}
export function useOnlineSelector<T>(select: (snapshot: OnlineSnapshot) => T): T {
  const store = useOnlineStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()), () => select(store.getServerSnapshot()));
}
