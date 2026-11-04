import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { ChakraProvider } from "@chakra-ui/react";
import { NextIntlClientProvider } from "next-intl";
import PageView from "@/app/[locale]/(library)/page/[address]/page";
import { StageProvider } from "@/components/explore/stage/StageProvider";
import { system } from "@/lib/theme";
import { cellOf, cellKey, chunkKeyOf } from "@/lib/world";
import { fogToBase64, emptyFog } from "@/lib/online/fog";
import type { Note } from "@/lib/online/protocol";
import messages from "../../../messages/ru.json";
import { createOnlineStore } from "./onlineStore";

let online = createOnlineStore();
let search = new URLSearchParams();
const path = (href: string) => href;
vi.mock("next/navigation", () => ({ useParams: () => ({ address: "1-1-1-1-4" }), useSearchParams: () => search }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useLocalizedPath: () => path, Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/LibraryNav", () => ({ default: () => null }));
vi.mock("@/components/AddressDisplay", () => ({ default: () => null }));
vi.mock("./OnlineProvider", () => ({
  useOnlineStore: () => online,
  useOnlineSelector: (select: (s: ReturnType<typeof online.getSnapshot>) => unknown) => useSyncExternalStore(online.subscribe, () => select(online.getSnapshot())),
}));
const anchor = { wall: 1, shelf: 1, volume: 1, page: 4, start: 80, end: 138 };
const key = chunkKeyOf(cellOf("1"));
const note: Note = { id: 7, cell: cellKey(cellOf("1")), anchor, author: "other", nick: "Автор", color: "#abcdef", highlightColor: "#b02e3a", text: "", at: "" };
function ui() {
  return <NextIntlClientProvider locale="ru" messages={messages}><ChakraProvider value={system}><StageProvider><PageView /></StageProvider></ChakraProvider></NextIntlClientProvider>;
}
async function select(start: number, end: number) {
  const el = document.querySelector('[data-page-text="4"]')!;
  const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
  const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
  document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
  await act(async () => { document.dispatchEvent(new Event("selectionchange")); await new Promise(r => setTimeout(r, 90)); });
}
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  search = new URLSearchParams();
  online = createOnlineStore();
  online.receive({ type: "welcome", you: { id: "me", nick: "Я", color: "#b02e3a" }, last: null, admin: false });
  online.receive({ type: "chunk", key, fog: fogToBase64(emptyFog()), notes: [] });
  online.send = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ title: "Книга", pages: [4, 5].map(page => ({ page, content: "абвгдежз".repeat(600) })) }) })));
});
afterEach(() => { cleanup(); document.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("keeps a live drag intact and lets a new draft save while the old acknowledgement is delayed", async () => {
  render(ui());
  fireEvent.click(await screen.findByRole("button", { name: "текст и адрес" }));
  await waitFor(() => expect(document.querySelector('[data-page-text="4"]')?.textContent?.length).toBe(4800));
  await select(80, 100); await select(80, 138);
  expect(document.getSelection()!.toString()).toHaveLength(58);
  fireEvent.click(screen.getByRole("button", { name: "Сохранить метку" }));
  expect(online.send).toHaveBeenCalledWith(expect.objectContaining({ type: "note", anchor, text: "", highlightColor: "#b02e3a" }));
  fireEvent.click(screen.getByTitle(messages.Reader.clearFragment));
  await select(10, 40);
  expect((screen.getByRole("button", { name: "Сохранить метку" }) as HTMLButtonElement).disabled).toBe(false);
});

it("loads marks on a plain page, repaints live and focuses a same-page chat link without exposing edits", async () => {
  online.receive({ type: "chunk", key, fog: fogToBase64(emptyFog()), notes: [note] });
  const view = render(ui());
  fireEvent.click(await screen.findByRole("button", { name: "текст и адрес" }));
  await waitFor(() => expect(document.querySelector("mark[data-saved-colors]")?.getAttribute("data-saved-colors")).toBe("#b02e3a"));
  search = new URLSearchParams("note=7"); view.rerender(ui());
  await screen.findByText("Сохранено для всех");
  expect(screen.queryByRole("button", { name: "Удалить метку" })).toBeNull();
  act(() => online.receive({ type: "painted", id: 7, color: "#4f9a5a" }));
  expect(document.querySelector("mark[data-saved-colors]")?.getAttribute("data-saved-colors")).toBe("#4f9a5a");
  fireEvent.click(screen.getByRole("button", { name: "В чат" }));
  expect(online.send).toHaveBeenCalledWith({ type: "share-note", id: 7 });
  act(() => online.receive({ type: "forgotten", kind: "note", id: 7 }));
  expect(document.querySelector("mark[data-saved-colors]")).toBeNull();
  expect(document.querySelector("mark[data-fragment]")).toBeNull();
});
