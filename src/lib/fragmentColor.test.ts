import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FRAGMENT_COLOR,
  FRAGMENT_COLOR_KEY,
  fragmentWash,
  hexToRgb,
  parseHexColor,
  readFragmentColor,
  resetFragmentColorCache,
  useFragmentColor,
  writeFragmentColor,
} from "./fragmentColor";

describe("parseHexColor", () => {
  it("takes #rrggbb in any case and gives it in lower case", () => {
    expect(parseHexColor("#3A6FC4")).toBe("#3a6fc4");
    expect(parseHexColor(" #b02e3a ")).toBe("#b02e3a");
  });

  it.each([null, undefined, 42, "", "red", "#abc", "#12345g", "3a6fc4", "#3a6fc4ff"])("rejects %j", (raw) => {
    expect(parseHexColor(raw)).toBeNull();
  });
});

describe("fragmentWash", () => {
  it("turns the colour into a translucent rgba", () => {
    expect(hexToRgb("#3a6fc4")).toEqual([58, 111, 196]);
    expect(fragmentWash("#3a6fc4", 0.26)).toBe("rgba(58, 111, 196, 0.26)");
  });

  it("falls back to the default colour for garbage", () => {
    expect(hexToRgb("nope")).toEqual(hexToRgb(DEFAULT_FRAGMENT_COLOR));
  });
});

describe("the remembered colour", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFragmentColorCache();
  });
  afterEach(() => {
    localStorage.clear();
    resetFragmentColorCache();
  });

  it("starts with the default colour", () => {
    expect(readFragmentColor()).toBe(DEFAULT_FRAGMENT_COLOR);
  });

  it("is kept in localStorage and read back after a reload", () => {
    writeFragmentColor("#3A6FC4");
    expect(localStorage.getItem(FRAGMENT_COLOR_KEY)).toBe("#3a6fc4");
    resetFragmentColorCache(); // a new page load
    expect(readFragmentColor()).toBe("#3a6fc4");
  });

  it("ignores a broken stored value and a bad colour to write", () => {
    localStorage.setItem(FRAGMENT_COLOR_KEY, "javascript:alert(1)");
    expect(readFragmentColor()).toBe(DEFAULT_FRAGMENT_COLOR);
    writeFragmentColor("not a colour");
    expect(readFragmentColor()).toBe(DEFAULT_FRAGMENT_COLOR);
  });

  it("forgets the stored value when set back to the default", () => {
    writeFragmentColor("#4f9a5a");
    writeFragmentColor(DEFAULT_FRAGMENT_COLOR);
    expect(localStorage.getItem(FRAGMENT_COLOR_KEY)).toBeNull();
  });

  it("updates every component that shows it, and follows a colour picked in another tab", () => {
    const panel = renderHook(() => useFragmentColor());
    const book = renderHook(() => useFragmentColor());
    act(() => panel.result.current[1]("#7b52c7"));
    expect(book.result.current[0]).toBe("#7b52c7");

    act(() => {
      localStorage.setItem(FRAGMENT_COLOR_KEY, "#2e8f9e");
      window.dispatchEvent(new StorageEvent("storage", { key: FRAGMENT_COLOR_KEY, newValue: "#2e8f9e" }));
    });
    expect(panel.result.current[0]).toBe("#2e8f9e");
    expect(book.result.current[0]).toBe("#2e8f9e");
  });
});
