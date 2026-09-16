// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALPHABETS, foreignSymbols, normalizeQuery, normalizeText } from "./alphabet";
import { createBabel, libraryFor } from "./babel";
import { DIGS, LIBRARY, MAX_ADDRESS_LENGTH, addressLength, addressPacking, isValidHex } from "./library";
import { locales } from "@/i18n/locales";

/** Made up, in the shape of real proxy keys: every mark a link can carry. */
const KEYS = [
  "hysteria2://Xk3fQ9zLmP2vT7wR@cdn-example.test:443/?obfs=salamander&obfs-password=Qw8Ze2Rt5Yu1Io4P&sni=cdn-example.test#NL1-hy2",
  "vless://0b7f6a2e-4c1d-4e8b-9a3f-5d2c1b0a9e8f@203.0.113.7:8443?type=tcp&security=reality&pbk=Zx_9-aB3cD4eF5gH6iJ7kL8mN&fp=chrome&sid=6ba85179#DE%20Frankfurt",
  "ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpQYXNzK3dvcmQvPT0=@198.51.100.2:8388#Test~[1]{2}|3^4`5\\6",
];

const CODE = `function greet(name) {\n    if (!name) return "Привет, мир!";\n    return \`Hello, \${name}\`; // <b>&amp;</b>\n}\n`;

const random = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

describe("the alphabets", () => {
  it("hold letters of both cases, the line break and every printable ASCII symbol", () => {
    expect(ALPHABETS.en.length).toBe(98);
    expect(ALPHABETS.ru.length).toBe(166);
    for (const locale of locales) {
      const alphabet = ALPHABETS[locale];
      expect(new Set(alphabet).size).toBe(alphabet.length);
      for (let code = 32; code < 127; code++) expect(alphabet).toContain(String.fromCharCode(code));
      expect(alphabet).toContain("\n");
    }
    expect(ALPHABETS.ru).toContain("Ё");
    expect(ALPHABETS.ru).toContain("«");
  });

  it("take a key as it is, case and all", () => {
    for (const locale of locales) for (const key of KEYS) expect(normalizeQuery(key, locale)).toBe(key);
  });

  it("keep line breaks and indentation, spread tabs and unify line ends", () => {
    expect(normalizeQuery("a\r\nb\rc\n\td  e", "en")).toBe("a\nb\nc\n    d  e");
    expect(normalizeQuery(CODE, "ru")).toBe(CODE);
    expect(normalizeQuery("Ёлка — «ёж»", "en")).toBe(' — ""');
    expect(normalizeQuery("ё “x” – 1", "ru")).toBe('ё "x" — 1');
  });

  it("report what they cannot hold", () => {
    expect(foreignSymbols("key 🔑 №5\tok\n", "ru")).toEqual(["🔑", "№"]);
    expect(foreignSymbols("Привет", "en")).toEqual(["П", "р", "и", "в", "е", "т"]);
  });
});

describe("addresses", () => {
  it("take one digit per symbol while the alphabet fits the digits, and blocks after that", () => {
    expect(addressPacking(59)).toMatchObject({ chars: 1, digits: 1 });
    expect(addressPacking(ALPHABETS.ru.length)).toMatchObject({ chars: 4, digits: 5 });
    expect(addressPacking(ALPHABETS.en.length)).toMatchObject({ chars: 7, digits: 8 });
    expect(MAX_ADDRESS_LENGTH).toBe(addressLength(LIBRARY.pageLength, addressPacking(ALPHABETS.ru.length)));
    expect(MAX_ADDRESS_LENGTH).toBeLessThan(LIBRARY.pageLength * 1.3);
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

  it("finds a key and reads it back from its address", () => {
    for (const key of KEYS) {
      const address = babel.search(key);
      const hex = address.split("-")[0];
      expect(isValidHex(hex)).toBe(true);
      expect(babel.getPage(address)).toContain(key);
      expect(babel.getPage(babel.searchExactly(key)).trim()).toBe(key);
    }
  });

  it("finds code with its line breaks", () => {
    // The English Library has no Cyrillic, so the greeting loses its words there.
    const code = normalizeQuery(CODE, locale).trim();
    expect(code.split("\n")).toHaveLength(4);
    expect(babel.getPage(babel.searchExactly(CODE))).toContain(code);
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
    const title = locale === "ru" ? "Ключ: vless://Ab_C" : "Key: vless://Ab_C";
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
  it("drops what an alphabet does not have", () => {
    expect(normalizeText("AbC d!", "abc ")).toBe("b ");
  });
});
