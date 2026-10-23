// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALPHABETS, foreignSymbols, normalizeQuery, normalizeText } from "./alphabet";
import { createBabel, libraryFor } from "./babel";
import { DIGS, LIBRARY, MAX_ADDRESS_LENGTH, addressLength, addressPacking, isValidHex } from "./library";
import { locales } from "@/i18n/locales";

const random = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

describe("the alphabets", () => {
  it("hold small letters, the space and six marks", () => {
    expect(ALPHABETS.ru.length).toBe(40);
    expect(ALPHABETS.en.length).toBe(33);
    for (const locale of locales) {
      const alphabet = ALPHABETS[locale];
      expect(new Set(alphabet).size).toBe(alphabet.length);
      for (const mark of " .,!?-:") expect(alphabet).toContain(mark);
      expect(alphabet).not.toMatch(/[\nA-ZА-ЯЁ0-9"'«»]/);
    }
    expect(ALPHABETS.ru).toContain("ё");
    expect(ALPHABETS.ru).not.toMatch(/[a-z]/);
  });

  it("write capitals small and every kind of whitespace as a space", () => {
    expect(normalizeQuery("Привет,\r\nМир!\tЁж", "ru")).toBe("привет, мир! ёж");
    expect(normalizeQuery("Hello\n\nWorld", "en")).toBe("hello  world");
  });

  it("turn dashes and the ellipsis into marks and drop the rest", () => {
    expect(normalizeQuery("Ёлка — «ёж»…", "ru")).toBe("ёлка - ёж...");
    expect(normalizeQuery("Ёлка — «ёж» 42", "en")).toBe(" -  ");
  });

  it("report what they cannot hold, but not capitals or whitespace", () => {
    expect(foreignSymbols("Мир 🔑 №5\tда\n", "ru")).toEqual(["🔑", "№", "5"]);
    expect(foreignSymbols("Hi, Мир", "en")).toEqual(["М", "и", "р"]);
  });
});

describe("addresses", () => {
  it("take one digit per symbol: both alphabets fit the 62 digits", () => {
    expect(addressPacking(59)).toMatchObject({ chars: 1, digits: 1 });
    expect(addressPacking(ALPHABETS.ru.length)).toMatchObject({ chars: 1, digits: 1 });
    expect(addressPacking(ALPHABETS.en.length)).toMatchObject({ chars: 1, digits: 1 });
    expect(MAX_ADDRESS_LENGTH).toBe(LIBRARY.pageLength);
  });

  it("give a short last block a width of its own, whatever the size of the alphabet", () => {
    for (let size = 2; size <= 400; size++) {
      const packing = addressPacking(size);
      const widths = Array.from({ length: packing.chars }, (_, i) => addressLength(i + 1, packing));
      widths.forEach((w, i) => i && expect(w, `size ${size}`).toBeGreaterThan(widths[i - 1]));
    }
    // 27 symbols would fit 5 to 4 digits, but then 4 symbols would take 4 digits too.
    expect(addressPacking(27)).toMatchObject({ chars: 1, digits: 1 });
  });

  it("keep the old one-digit-per-symbol mapping for a small alphabet", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz ";
    const babel = createBabel({ alphabet, digs: DIGS });
    for (let n = 0; n < 30; n++) {
      const text = random(alphabet, 1 + Math.floor(Math.random() * 40));
      const address = babel.search(text);
      expect(address.split("-")[0].length).toBeLessThanOrEqual(LIBRARY.pageLength);
      expect(babel.getPage(address)).toContain(text);
    }
  });
});

describe.each(locales)("the %s Library", (locale) => {
  const babel = libraryFor(locale);
  const alphabet = ALPHABETS[locale];

  const PHRASE = locale === "ru" ? "в начале было слово, и слово было: книга!" : "in the beginning was the word: a book!";

  it("finds a phrase and reads it back from its address", () => {
    const address = babel.search(PHRASE);
    expect(isValidHex(address.split("-")[0])).toBe(true);
    expect(babel.getPage(address)).toContain(PHRASE);
    expect(babel.getPage(babel.searchExactly(PHRASE)).trim()).toBe(PHRASE);
  });

  it("finds a phrase typed with capitals and line breaks", () => {
    const typed = PHRASE.toUpperCase().replace(/ /g, "\n");
    expect(babel.getPage(babel.searchExactly(typed)).trim()).toBe(PHRASE);
  });


  it("writes any page and reads the same page back, whatever the length of the text", () => {
    for (let n = 0; n < 40; n++) {
      const text = random(alphabet, 1 + Math.floor(Math.random() * 60));
      expect(babel.getPage(babel.search(text))).toContain(text);
    }
    const page = random(alphabet, LIBRARY.pageLength);
    const address = babel.search(page);
    expect(address.split("-")[0].length).toBeLessThanOrEqual(MAX_ADDRESS_LENGTH);
    expect(babel.getPage(address)).toBe(page);
  });

  it("finds titles", () => {
    const title = locale === "ru" ? "ключ найден!" : "key found!";
    expect(babel.getTitle(babel.searchTitle(title)).trimEnd()).toBe(title);
  });

  it("reads a full page out of any string of digits, the same page every time", () => {
    for (const length of [1, 2, 3, 4, 5, 7, 8, 9, 100, LIBRARY.pageLength, MAX_ADDRESS_LENGTH]) {
      const hex = random(DIGS, length);
      const address = `${hex}-3-4-12-200`;
      const page = babel.getPage(address);
      expect(page).toHaveLength(LIBRARY.pageLength);
      expect(Array.from(page).every((c) => alphabet.includes(c))).toBe(true);
      expect(babel.getPage(address)).toBe(page);
    }
  });

  it("gives a found text an address that looks like any other", () => {
    const hex = babel.searchExactly("a").split("-")[0];
    expect(new Set(hex).size).toBeGreaterThan(55);
  });
});

describe("normalizeText", () => {
  it("drops what an alphabet does not have and writes capitals small", () => {
    expect(normalizeText("AbC d!", "abc ")).toBe("abc ");
  });
});
