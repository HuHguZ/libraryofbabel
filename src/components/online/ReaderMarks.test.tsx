import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect, useSyncExternalStore } from "react";
import { ChakraProvider } from "@chakra-ui/react";
import { NextIntlClientProvider } from "next-intl";
import PageView from "@/app/[locale]/(library)/page/[address]/page";
import { StageProvider, useStageStore } from "@/components/explore/stage/StageProvider";
import type { StageStore } from "@/components/explore/stage/stageStore";
import { system } from "@/lib/theme";
import { cellOf, cellKey, chunkKeyOf } from "@/lib/world";
import { fogToBase64, emptyFog } from "@/lib/online/fog";
import type { Note } from "@/lib/online/protocol";
import messages from "../../../messages/ru.json";
import { createOnlineStore } from "./onlineStore";

let online = createOnlineStore();
let search = new URLSearchParams();
let stage: StageStore;
function CaptureStage() {
  const store = useStageStore();
  useEffect(() => { stage = store; }, [store]);
  return null;
}
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
  return <NextIntlClientProvider locale="ru" messages={messages}><ChakraProvider value={system}><StageProvider><PageView /><CaptureStage /></StageProvider></ChakraProvider></NextIntlClientProvider>;
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

const peer = { id: "other", nick: "Читатель", color: "#abcdef", cell: cellKey(cellOf("1")), p: [0, 1.6, 0] as [number, number, number], yaw: 0, view: { kind: "desk" as const, wall: 1, shelf: 1, volume: 1, page: 4 } };
const draft = { page: 4, start: 100, end: 180, color: "#123456" };
const loupe = { page: 4, u: 0.2, v: 0.3, power: 3 };

it("shows changing unsaved peer selections, reads fresh loupe positions and clears the draft without creating notes", async () => {
  online.receive({ type: "players", list: [{ ...peer, reading: { fragment: draft, loupe } }] });
  render(ui());
  fireEvent.click(await screen.findByRole("button", { name: "текст и адрес" }));
  await screen.findByText("Читатель выделяет");
  await waitFor(() => expect(document.querySelector('mark[data-saved-colors="#123456"]')?.textContent).toHaveLength(80));
  expect(screen.queryByRole("button", { name: "Сохранить метку" })).toBeNull();
  expect(stage.getSnapshot().desk?.highlights).toEqual([]);
  expect(stage.getSnapshot().desk?.liveHighlights).toMatchObject([{ ...draft, author: "other" }]);
  const getLoupes = stage.getSnapshot().desk?.getLoupes;
  expect(getLoupes?.()).toEqual([{ ...loupe, color: peer.color }]);
  act(() => online.receive({ type: "poses", list: [{ ...peer, reading: { fragment: draft, loupe: { ...loupe, u: 0.7 } } }] }));
  expect(stage.getSnapshot().desk?.getLoupes).toBe(getLoupes);
  expect(getLoupes?.()[0].u).toBe(0.7);
  act(() => online.receive({ type: "poses", list: [{ ...peer, reading: { fragment: { ...draft, end: 200, color: "#4f9a5a" } } }] }));
  expect(document.querySelector('mark[data-saved-colors="#4f9a5a"]')?.textContent).toHaveLength(100);
  act(() => online.receive({ type: "poses", list: [peer] }));
  expect(screen.queryByText("Читатель выделяет")).toBeNull();
  expect(document.querySelector("mark[data-saved-colors]")).toBeNull();
  expect(stage.getSnapshot().desk?.liveHighlights).toEqual([]);
  expect(online.notesAt(cellOf("1"))).toEqual([]);
  expect(online.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "note" }));
});

it("replaces a peer's live wash with its saved range instead of painting it twice", async () => {
  online.receive({ type: "players", list: [{ ...peer, reading: { fragment: draft } }] });
  render(ui());
  fireEvent.click(await screen.findByRole("button", { name: "текст и адрес" }));
  await screen.findByText("Читатель выделяет");
  act(() => online.receive({ type: "noted", note: { ...note, anchor: { ...anchor, start: draft.start, end: draft.end }, highlightColor: draft.color } }));
  expect(screen.queryByText("Читатель выделяет")).toBeNull();
  expect(stage.getSnapshot().desk?.liveHighlights).toEqual([]);
  expect(stage.getSnapshot().desk?.highlights).toMatchObject([draft]);
  expect(online.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "note" }));
});

it("preserves the active DOM range while peer drafts change and applies the newest wash once selection ends", async () => {
  render(ui());
  fireEvent.click(await screen.findByRole("button", { name: "текст и адрес" }));
  await waitFor(() => expect(document.querySelector('[data-page-text="4"]')?.textContent?.length).toBe(4800));
  await select(80, 138);
  const selection = document.getSelection()!, node = selection.getRangeAt(0).startContainer;
  act(() => online.receive({ type: "players", list: [{ ...peer, reading: { fragment: draft } }] }));
  act(() => online.receive({ type: "poses", list: [{ ...peer, reading: { fragment: { ...draft, start: 60, end: 160, color: "#4f9a5a" } } }] }));
  expect(selection.toString()).toHaveLength(58);
  expect(selection.getRangeAt(0).startContainer).toBe(node);
  expect(selection.getRangeAt(0).startOffset).toBe(80);
  expect(selection.getRangeAt(0).endOffset).toBe(138);
  expect(document.querySelector("mark[data-saved-colors]")).toBeNull();
  await act(async () => { selection.removeAllRanges(); document.dispatchEvent(new Event("selectionchange")); await new Promise(done => setTimeout(done, 90)); });
  expect([...document.querySelectorAll('mark[data-saved-colors="#4f9a5a"]')].map(el => el.textContent).join("")).toHaveLength(100);
  act(() => online.receive({ type: "poses", list: [peer] }));
  expect(document.querySelector("mark[data-saved-colors]")).toBeNull();
  expect(document.querySelector("mark[data-fragment]")).not.toBeNull();
  expect(online.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "note" }));
});

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
