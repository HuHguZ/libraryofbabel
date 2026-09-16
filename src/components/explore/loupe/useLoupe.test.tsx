import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLoupe } from "./useLoupe";

const press = (init: KeyboardEventInit, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });

describe("useLoupe", () => {
  it("is put away at first and toggled by the button", () => {
    const { result } = renderHook(() => useLoupe());
    expect(result.current.active).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.active).toBe(false);
  });

  it("is taken and put away with L, in any layout", () => {
    const { result } = renderHook(() => useLoupe());
    press({ code: "KeyL", key: "l" });
    expect(result.current.active).toBe(true);
    // Embedded browsers can leave the code empty: the Russian letter on the same key counts too.
    press({ code: "", key: "д" });
    expect(result.current.active).toBe(false);
  });

  it("is put away with Escape", () => {
    const { result } = renderHook(() => useLoupe());
    act(() => result.current.toggle());
    press({ code: "", key: "Escape" });
    expect(result.current.active).toBe(false);
  });

  it("leaves Escape alone while the loupe is put away", () => {
    renderHook(() => useLoupe());
    const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores L typed into a field, with a modifier, or held down", () => {
    const { result } = renderHook(() => useLoupe());
    const input = document.createElement("input");
    document.body.append(input);
    press({ code: "KeyL", key: "l" }, input);
    press({ code: "KeyL", key: "l", ctrlKey: true });
    press({ code: "KeyL", key: "l", repeat: true });
    expect(result.current.active).toBe(false);
    input.remove();
  });

  it("can do without the key", () => {
    const { result } = renderHook(() => useLoupe({ hotkey: false }));
    press({ code: "KeyL", key: "l" });
    expect(result.current.active).toBe(false);
  });
});

describe("useLoupe and the mouse wheel button", () => {
  // jsdom may lack PointerEvent; the hook reads only what MouseEvent has.
  const pointer = (type: string, target: EventTarget, init: MouseEventInit) =>
    act(() => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
    });
  const click = (target: EventTarget, from = { x: 100, y: 100 }, to = from, button = 1) => {
    pointer("pointerdown", target, { button, clientX: from.x, clientY: from.y });
    pointer("pointerup", target, { button, clientX: to.x, clientY: to.y });
  };

  it("takes the loupe and puts it away with a click over the scene", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const { result } = renderHook(() => useLoupe());
    click(canvas);
    expect(result.current.active).toBe(true);
    click(canvas);
    expect(result.current.active).toBe(false);
    canvas.remove();
  });

  it("leaves a drag with the wheel button to the scene, and other buttons and the page alone", () => {
    const canvas = document.createElement("canvas");
    const link = document.createElement("a");
    document.body.append(canvas, link);
    const { result } = renderHook(() => useLoupe());
    click(canvas, { x: 100, y: 100 }, { x: 140, y: 100 });
    click(canvas, { x: 100, y: 100 }, { x: 100, y: 100 }, 0);
    click(link);
    expect(result.current.active).toBe(false);
    canvas.remove();
    link.remove();
  });

  it("keeps the browser's autoscroll off the scene only", () => {
    const canvas = document.createElement("canvas");
    const link = document.createElement("a");
    document.body.append(canvas, link);
    renderHook(() => useLoupe());
    const overScene = new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true });
    const overLink = new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true });
    act(() => {
      canvas.dispatchEvent(overScene);
      link.dispatchEvent(overLink);
    });
    expect(overScene.defaultPrevented).toBe(true);
    expect(overLink.defaultPrevented).toBe(false);
    canvas.remove();
    link.remove();
  });

  it("can do without the wheel button", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const { result } = renderHook(() => useLoupe({ middleClick: false }));
    click(canvas);
    expect(result.current.active).toBe(false);
    canvas.remove();
  });
});
