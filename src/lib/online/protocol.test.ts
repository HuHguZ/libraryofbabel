// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanColor, cleanNick, cleanText, parseClientMessage } from "./protocol";
const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));
const pose = { type: "pose", cell: "3:-2", p: [1, 1.6, 0], yaw: 0.5, view: { kind: "walk", wall: 2 } };
describe("client protocol", () => {
  it("accepts clean profiles and known worlds", () => {
    expect(parse({ type: "hello", lang: "ru" })).toEqual({ type: "hello", lang: "ru" });
    expect(parse({ type: "hello", lang: "de" })).toBeNull();
    expect(parse({ type: "hello", lang: "en", admin: "x".repeat(201) })).toBeNull();
    expect(parse({ type: "profile", nick: "  Quiet   reader ", color: "#B02E3A" })).toEqual({ type: "profile", nick: "Quiet reader", color: "#b02e3a" });
    expect(parse({ type: "profile" })).toBeNull();
    expect(cleanNick("a")).toBeNull();
    expect(cleanNick("bad\u0007bell")).toBeNull();
    expect(cleanColor("red")).toBeNull();
  });
  it("bounds finite poses, cells and book views", () => {
    expect(parse(pose)).toEqual(pose);
    for (const changed of [{ p: [1, 2] }, { p: [1e9, 0, 0] }, { yaw: null }, { cell: "nowhere" }, { cell: "9".repeat(20000) + ":0" }, { view: { kind: "walk", wall: 5 } }, { view: { kind: "desk", wall: 1, shelf: 1, volume: 32, page: 0 } }]) expect(parse({ ...pose, ...changed })).toBeNull();
    expect(parseClientMessage('{"type":"pose","cell":"0:0","p":[0,0,0],"yaw":1e999,"view":{"kind":"walk","wall":1}}')).toBeNull();
    expect(parse({ ...pose, view: { kind: "desk", wall: 4, shelf: 7, volume: 31, page: 421 } })).not.toBeNull();
  });
  it("deduplicates bounded watches", () => {
    expect(parse({ type: "watch", chunks: ["0:0", "-1:2", "0:0"] })).toEqual({ type: "watch", chunks: ["0:0", "-1:2"] });
    for (const chunks of [[], ["x"], Array.from({ length: 65 }, (_, i) => `${i}:0`)]) expect(parse({ type: "watch", chunks })).toBeNull();
  });
  it("normalises equivalent cell keys before storing or matching notes", () => {
    expect(parse({ ...pose, cell: "0003:-0" })).toMatchObject({ cell: "3:0" });
    expect(parse({ type: "note", cell: "00:-0", text: "finding" })).toMatchObject({ cell: "0:0" });
    expect(parse({ type: "watch", chunks: ["0:0", "00:-0"] })).toEqual({ type: "watch", chunks: ["0:0"] });
  });
  it("checks text and selected fragments", () => {
    expect(cleanText(" a \n b ")).toBe("a b");
    for (const text of [" ", "x".repeat(301), "bad\u0007", 5]) expect(cleanText(text)).toBeNull();
    expect(parse({ type: "chat", text: " hi " })).toEqual({ type: "chat", text: "hi" });
    const anchor = { wall: 4, shelf: 7, volume: 31, page: 421, start: 0, end: 12 };
    expect(parse({ type: "note", cell: "0:0", anchor, text: "hello" })).toMatchObject({ anchor });
    expect(parse({ type: "note", cell: "0:0", text: "hello" })).toEqual({ type: "note", cell: "0:0", anchor: null, text: "hello" });
    expect(parse({ type: "note", cell: "0:0", anchor: { ...anchor, page: 0 }, text: "hello" })).toBeNull();
    expect(parse({ type: "chat", text: "hi", place: { cell: "0:0", view: { kind: "walk", wall: 1 }, fragment: { page: 1, start: 0, end: 2 } } })).toBeNull();
    expect(parse({ type: "forget", kind: "note", id: 12 })).not.toBeNull();
    expect(parse({ type: "forget", kind: "note", id: 1e30 })).toBeNull();
    expect(parse({ type: "ban", guest: "me" })).toBeNull();
  });
  it("drops malformed, oversized and unknown messages", () => {
    for (const raw of ["{", "null", "[]", JSON.stringify({ type: "unknown" }), JSON.stringify({ ...pose, pad: "x".repeat(70000) })]) expect(parseClientMessage(raw)).toBeNull();
  });
});
