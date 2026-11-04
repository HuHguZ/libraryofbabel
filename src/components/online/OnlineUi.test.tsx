import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@chakra-ui/react";
import { NextIntlClientProvider } from "next-intl";
import { StageProvider } from "@/components/explore/stage/StageProvider";
import { system } from "@/lib/theme";
import messages from "../../../messages/en.json";
import ruMessages from "../../../messages/ru.json";
import { createOnlineStore } from "./onlineStore";
import ChatPanel from "./ChatPanel";
import MapLayer from "./MapLayer";
import GalleryNotes from "./GalleryNotes";
import NoteComposer from "./NoteComposer";
import OnlineHud from "./OnlineHud";
import { RateLimits } from "@/server/limits";

let online = createOnlineStore();
const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./LibraryMap", () => ({ default: ({ mode }: { mode: string }) => <div data-testid={`map-${mode}`} /> }));
vi.mock("@/components/explore/FragmentColorPicker", () => ({ default: ({ color, onChange }: { color: string; onChange: (color: string) => void }) => <input aria-label="clothes colour" value={color} onChange={(event) => onChange(event.target.value)} /> }));
vi.mock("./OnlineProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useOnlineStore: () => online,
    useOnlineSelector: (select: (snapshot: ReturnType<typeof online.getSnapshot>) => unknown) => useSyncExternalStore(online.subscribe, () => select(online.getSnapshot())),
    rememberAdmin: vi.fn(),
  };
});
const welcome = { type: "welcome" as const, you: { id: "me", nick: "Reader", color: "#b02e3a" }, last: null, admin: false };
const cell = { x: 0n, floor: 0n };
function ui(children: React.ReactNode, locale: "en" | "ru" = "en") {
  return render(<NextIntlClientProvider locale={locale} messages={locale === "ru" ? ruMessages : messages}><ChakraProvider value={system}><StageProvider>{children}</StageProvider></ChakraProvider></NextIntlClientProvider>);
}
beforeEach(() => { online = createOnlineStore(); online.receive(welcome); push.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("online controls", () => {
  it.each(["en", "ru"] as const)("closes chat by a touch-accessible button in %s", (locale) => {
    const copy = locale === "ru" ? ruMessages : messages;
    ui(<ChatPanel />, locale);
    fireEvent.click(screen.getByRole("button", { name: copy.Chat.open }));
    expect(screen.getByRole("textbox", { name: copy.Chat.placeholder })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Закрыть чат" : "Close chat" }));
    expect(screen.queryByRole("textbox", { name: copy.Chat.placeholder })).toBeNull();
    expect(screen.getByRole("button", { name: copy.Chat.open })).not.toBeNull();
  });
  it("follows the latest chat on opening and new messages without interrupting older-history reading", () => {
    const message = (id: number) => ({ id, author: "other", nick: "Other", color: "#abcdef", text: `Line ${id}`, place: null, at: new Date().toISOString() });
    online.receive({ type: "history", messages: Array.from({ length: 30 }, (_, i) => message(i + 1)) });
    ui(<ChatPanel />);
    const history = screen.getByText("Line 30").parentElement!.parentElement!;
    let height = 1000;
    Object.defineProperties(history, { scrollHeight: { get: () => height }, clientHeight: { value: 300 } });
    fireEvent.click(screen.getByRole("button", { name: messages.Chat.open }));
    expect(history.scrollTop).toBeGreaterThanOrEqual(700);
    height = 1200;
    act(() => online.receive({ type: "message", message: message(31) }));
    expect(history.scrollTop).toBeGreaterThanOrEqual(900);
    history.scrollTop = 100;
    fireEvent.scroll(history);
    height = 1400;
    act(() => online.receive({ type: "message", message: message(32) }));
    expect(history.scrollTop).toBe(100);
    history.scrollTop = 1100;
    fireEvent.scroll(history);
    height = 1600;
    act(() => online.receive({ type: "message", message: message(33) }));
    expect(history.scrollTop).toBeGreaterThanOrEqual(1300);
    history.scrollTop = 100;
    fireEvent.scroll(history);
    fireEvent.click(screen.getByRole("button", { name: messages.Chat.close }));
    fireEvent.click(screen.getByRole("button", { name: messages.Chat.open }));
    expect(history.scrollTop).toBeGreaterThanOrEqual(1300);
  });
  it("keeps a large roster in a named, height-limited scroll region", () => {
    online.receive({ type: "players", list: Array.from({ length: 30 }, (_, i) => ({
      id: `reader-${i}`, nick: `Reader${i}`.padEnd(24, "x"), color: "#abcdef", cell: "0:0",
      p: [0, 1.6, 0], yaw: 0, view: { kind: "walk", wall: 1 },
    })) });
    ui(<OnlineHud />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const roster = screen.getByRole("region");
    expect(roster.getAttribute("aria-label")).toBeTruthy();
    expect(getComputedStyle(roster).overflowY).toBe("auto");
    expect(getComputedStyle(roster).maxHeight).not.toBe("");
    expect(screen.getAllByRole("button", { name: messages.Online.goTo })).toHaveLength(30);
  });
  it("cancels a pending nickname when restored to the acknowledged name during cooldown", () => {
    vi.useFakeTimers();
    const sent: unknown[] = []; online.send = (message) => sent.push(message);
    ui(<OnlineHud />);
    fireEvent.click(screen.getByText(messages.Online.alone));
    fireEvent.change(screen.getByLabelText("clothes colour"), { target: { value: "#111111" } });
    act(() => vi.advanceTimersByTime(250));
    const nick = screen.getByLabelText(messages.Online.nick);
    fireEvent.change(nick, { target: { value: "Pending nickname" } }); fireEvent.blur(nick);
    fireEvent.change(nick, { target: { value: welcome.you.nick } }); fireEvent.blur(nick);
    act(() => vi.advanceTimersByTime(5100));
    expect(sent.at(-1)).toEqual({ type: "profile", nick: welcome.you.nick });
  });
  it("keeps the final local colour draft and sends its nearby nickname together after the profile bucket refills", () => {
    vi.useFakeTimers();
    const limits = new RateLimits(); const sent: unknown[] = [];
    online.send = (message) => {
      if (message.type !== "profile") return;
      expect(limits.take("profile", "me", "ip")).toBe(true);
      sent.push(message);
    };
    ui(<OnlineHud />);
    fireEvent.click(screen.getByText(messages.Online.alone));
    const color = screen.getByLabelText("clothes colour") as HTMLInputElement;
    fireEvent.change(color, { target: { value: "#111111" } });
    act(() => vi.advanceTimersByTime(250));
    fireEvent.change(color, { target: { value: "#222222" } });
    fireEvent.change(color, { target: { value: "#abcdef" } });
    act(() => online.receive({ ...welcome, you: { ...welcome.you, color: "#111111" } }));
    expect(color.value).toBe("#abcdef");
    const nick = screen.getByLabelText(messages.Online.nick);
    fireEvent.change(nick, { target: { value: "Final reader" } }); fireEvent.blur(nick);
    act(() => vi.advanceTimersByTime(5100));
    expect(sent).toEqual([{ type: "profile", color: "#111111" }, { type: "profile", color: "#abcdef", nick: "Final reader" }]);
  });
  it("keeps M and T out of text fields and opens the map and chat from the keyboard", () => {
    ui(<><input aria-label="typing" /><MapLayer /><ChatPanel /></>);
    const typing = screen.getByLabelText("typing");
    fireEvent.keyDown(typing, { key: "m", code: "KeyM" });
    fireEvent.keyDown(typing, { key: "t", code: "KeyT" });
    expect(screen.queryByTestId("map-full")).toBeNull();
    expect(screen.queryByPlaceholderText(messages.Chat.placeholder)).toBeNull();
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    const chat = screen.getByPlaceholderText(messages.Chat.placeholder);
    fireEvent.keyDown(chat, { key: "m", code: "KeyM" });
    expect(screen.queryByTestId("map-full")).toBeNull();
    fireEvent.keyDown(chat, { key: "Escape" });
    fireEvent.keyDown(window, { key: "m", code: "KeyM" });
    expect(screen.queryByTestId("map-full")).not.toBeNull();
    fireEvent.click(screen.getByText(messages.Map.close));
    expect(screen.queryByTestId("map-full")).toBeNull();
  });
  it("renders chat as text and exposes delete only to its author or an admin", () => {
    online.receive({ type: "history", messages: [{ id: 1, author: "other", nick: "Other", color: "#b02e3a", text: "<img src=x onerror=alert(1)>", place: null, at: new Date().toISOString() }] });
    ui(<ChatPanel />);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).not.toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText(messages.Chat.forget)).toBeNull();
    act(() => online.receive({ ...welcome, admin: true }));
    expect(screen.getByText(messages.Chat.forget)).not.toBeNull();
    expect(screen.getByText(messages.Chat.ban)).not.toBeNull();
  });
  it("keeps fragment anchors when composing and restricts note deletion", () => {
    const note = { id: 1, cell: "0:0", anchor: null, text: "Foreign note", author: "other", nick: "Other", color: "#b02e3a", at: new Date().toISOString() };
    online.receive({ type: "chunk", key: "0:0", fog: btoa("\u0000".repeat(128)), notes: [note] });
    const send = vi.fn(); online.send = send;
    const anchor = { wall: 2, shelf: 3, volume: 4, page: 5, start: 6, end: 9 };
    const done = vi.fn();
    ui(<><GalleryNotes cell={cell} /><NoteComposer cell={cell} anchor={anchor} onDone={done} /></>);
    expect(screen.queryByText(messages.Notes.forget)).toBeNull();
    act(() => online.receive({ ...welcome, admin: true }));
    expect(screen.getByText(messages.Notes.forget)).not.toBeNull();
    const input = screen.getByPlaceholderText(messages.Notes.placeholder);
    fireEvent.change(input, { target: { value: "A marked fragment" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledWith({ type: "note", cell: "0:0", anchor, text: "A marked fragment" });
    expect(done).toHaveBeenCalledOnce();
  });
});
