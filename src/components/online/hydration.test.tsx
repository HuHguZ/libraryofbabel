import { Suspense, use, useEffect } from "react";
import { act, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OnlineProvider, useOnlineSelector, useOnlineStore } from "./OnlineProvider";
import type { OnlineStore } from "./onlineStore";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));

it("hydrates a delayed boundary from the initial server snapshot after an early network welcome", async () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  let blocked = false;
  let online!: OnlineStore;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  function Status() {
    const status = useOnlineSelector((snapshot) => snapshot.status);
    return <span>{status}</span>;
  }
  function Delay() {
    if (blocked) use(ready);
    return <Status />;
  }
  function EarlyWelcome() {
    const store = useOnlineStore();
    useEffect(() => {
      online = store;
    }, [store]);
    return null;
  }
  const tree = <OnlineProvider><EarlyWelcome /><Suspense fallback={null}><Delay /></Suspense></OnlineProvider>;
  const container = document.createElement("div");
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  expect(container.textContent).toBe("connecting");
  blocked = true;
  const errors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  try {
    await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: (error) => errors.push(error) }); });
    act(() => online.receive({ type: "welcome", you: { id: "me", nick: "Reader", color: "#b02e3a" }, last: null, admin: false }));
    await act(async () => { blocked = false; release(); await ready; });
    await waitFor(() => expect(container.textContent).toBe("online"));
    expect(errors).toEqual([]);
  } finally {
    await act(async () => root?.unmount());
    container.remove(); vi.unstubAllGlobals();
  }
});
