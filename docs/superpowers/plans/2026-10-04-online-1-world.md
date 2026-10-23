# Online Library, plan 1 of 4: one world, Borges' galleries, the new alphabet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the spawn-relative vertical shaft into one global Library: every address has a fixed cell (column × floor), galleries have Borges' four walls and two doors and stand in rows, and the alphabet shrinks to lowercase letters, the space and six marks.

**Architecture:** A pure BigInt bijection (`src/lib/world.ts`) maps addresses to cells and back; the 3-D world is still built around one address (its anchor) but now streams a 2-D neighbourhood of columns and levels whose addresses come from that bijection. Walls map to hexagon sides through `wallSide`/`sideWall`; every gallery faces the same way.

**Tech Stack:** Next.js 16.3, React 19.2, @react-three/fiber 9.7, three 0.186, next-intl 4, Chakra UI 3, TypeScript 6, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-04-online-library-design.md` — read sections 1 and 2 before any task.

## Global Constraints

- No new npm dependencies in this plan. React stays `~19.2` (R3F 9.7 forbids 19.3).
- **No git commits or pushes** — the user commits only when they ask. At the end of the plan, ask whether to commit (they like several focused commits).
- Comments follow the surrounding code: short, explain why, British spelling ("colour", "neighbour", "centre").
- The number of lights in the scene never changes after the world mounts (11; spec 2.4). `GalleryControls`' listener effect keeps its dependency list `[gl, events, walk, pointerLock]`.
- Callbacks fired from the render loop read current state from refs, never from memoised closures.
- Shell: one simple command per call, absolute paths, no `cd … &&` chains, no inline heredocs or python; write helper scripts with the Write tool into the session's scratchpad directory. Bash commands over ~8 KB are truncated.
- The user runs `npm run dev` (port 3000) in their own terminal. Never start or stop it. Its log: `.next/dev/logs/next-development.log`.
- Browser checks: real Chrome through the chrome-devtools MCP (`select:mcp__chrome-devtools__new_page,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__select_page,mcp__chrome-devtools__evaluate_script,mcp__chrome-devtools__take_screenshot,mcp__chrome-devtools__list_console_messages`), page brought to front (`select_page` with `bringToFront: true`) or Chrome renders ~1 fps.
- Every task ends with `npm run typecheck`, `npm run lint` and `npm test` passing, each run as its own command from `C:\Users\user\Desktop\work\libraryofbabel`.

## Review Focus

- Short and odd addresses (`babel`, `0`, `000`) must still open a gallery and walk: `addressOf(cellOf(hex)) === hex` for every valid address — test in Task 2.
- The west doorway leads to column −1 and back as smoothly as the east one leads to +1 — walk test in Task 3.
- The stair works in the vestibule of any column, not only column 0 — test in Task 3.
- Search input with capitals, line breaks, digits and quotes is normalised, and digits are reported as foreign — tests in Task 1.
- Facing a doorway reports "vestibule" (wall 0), never a wall — `sideWall` test in Task 3 and the page wiring in Task 4.

## File map

New:
- `src/lib/world.ts` (+ `world.test.ts`) — cells, the address ↔ cell bijection, keys, spawn, coordinate formatting
- `src/components/explore/geometry.test.ts` — walking through rows of galleries
- `src/components/explore/worldAddresses.ts` (+ test) — per-world address cache around an anchor

Changed: `src/lib/alphabet.ts`, `src/lib/babel.test.ts`, `src/lib/library.ts`, `src/lib/hex.ts`, `tsconfig.json`, `src/components/explore/geometry.ts`, `src/components/explore/HexGalleryScene.tsx`, `src/components/explore/stage/{deskFrame,directorState,stageStore,Director,ReadingDesk}.ts(x)` and their tests, the three explore pages, `src/app/[locale]/page.tsx`, `messages/{ru,en}.json`, `README.md`, `README.en.md`.

## Task order

1 and 2 are independent. 3 needs nothing. 4 needs 3. 5 needs 2, 3 and 4. 6 needs 5. 7 last.

---

### Task 1: The readable-minimum alphabet

**Files:**
- Modify: `src/lib/alphabet.ts` (whole file above `findMatches`)
- Modify: `src/lib/babel.test.ts:1-49` (the alphabet tests), `:51-58` (packing expectations), `:84-121` (keys, code, titles)
- Modify: `src/app/[locale]/page.tsx:636-660` (NumbersSection), `messages/ru.json`, `messages/en.json`

**Interfaces:**
- Produces: `ALPHABETS: Record<Locale, string>` (ru 40, en 33), `ALPHABET_PARTS: Record<Locale, { letters: string; marks: string }>`, `normalizeText(text, alphabet)`, `normalizeQuery(text, locale)`, `foreignSymbols(text, locale)`, `findMatches` (unchanged).

- [ ] **Step 1: Write the failing tests** — replace the `describe("the alphabets", …)` block and the first test of `describe("addresses", …)` in `src/lib/babel.test.ts`, and delete `KEYS` and `CODE` at the top:

```ts
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
```

In `describe.each(locales)("the %s Library", …)` replace the tests "finds a key and reads it back from its address", "finds code with its line breaks" and "finds titles" with:

```ts
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

  it("finds titles", () => {
    const title = locale === "ru" ? "ключ найден!" : "key found!";
    expect(babel.getTitle(babel.searchTitle(title)).trimEnd()).toBe(title);
  });
```

And in `describe("normalizeText", …)`:

```ts
  it("drops what an alphabet does not have and writes capitals small", () => {
    expect(normalizeText("AbC d!", "abc ")).toBe("abc ");
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/babel.test.ts`
Expected: FAIL — `expected 166 to be 40`, and the normalisation tests.

- [ ] **Step 3: Rewrite the alphabet** — replace everything in `src/lib/alphabet.ts` above `/** Start offsets of the non-overlapping occurrences …` with:

```ts
import type { Locale } from "@/i18n/locales";

const LATIN = "abcdefghijklmnopqrstuvwxyz";
const CYRILLIC = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
/** The few marks a sentence needs (Borges' Library had only the comma and the full stop). */
const MARKS = ".,!?-:";

/** The symbols of each Library, grouped the way the home page counts them. */
export const ALPHABET_PARTS = {
  ru: { letters: CYRILLIC, marks: MARKS },
  en: { letters: LATIN, marks: MARKS },
} as const satisfies Record<Locale, { letters: string; marks: string }>;

/**
 * All symbols of a Library: small letters, the space and six marks. The fewer the symbols, the likelier a word turns
 * up by chance: a five-letter word is ~1200 times commoner among 40 symbols than among 166.
 */
export const ALPHABETS: Record<Locale, string> = {
  ru: `${CYRILLIC} ${MARKS}`,
  en: `${LATIN} ${MARKS}`,
};

/** Typographic variants that stand for marks of the alphabet. */
const FOLDS: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‒": "-",
  "―": "-",
  "−": "-",
  "‐": "-",
  "‑": "-",
  "…": "...",
};

const symbolSets = new Map<string, Set<string>>();

function symbolsOf(alphabet: string): Set<string> {
  let set = symbolSets.get(alphabet);
  if (!set) {
    set = new Set(Array.from(alphabet));
    symbolSets.set(alphabet, set);
  }
  return set;
}

/** What one symbol of a text becomes in an alphabet: itself, its small letter, a space, its marks, or nothing (null). */
function fold(c: string, symbols: Set<string>): string | null {
  if (/\s/.test(c)) return symbols.has(" ") ? " " : null;
  if (symbols.has(c)) return c;
  const small = c.toLowerCase();
  if (symbols.has(small)) return small;
  const marks = FOLDS[c];
  return marks && Array.from(marks).every((m) => symbols.has(m)) ? marks : null;
}

/**
 * Brings a text into an alphabet: capitals become small letters, every kind of whitespace (line breaks and tabs too)
 * becomes a space, dashes and the ellipsis become the alphabet's own marks, and every other symbol is dropped.
 */
export function normalizeText(text: string, alphabet: string): string {
  const symbols = symbolsOf(alphabet);
  let out = "";
  for (const c of text.normalize("NFC").replace(/\r\n/g, "\n")) out += fold(c, symbols) ?? "";
  return out;
}

/** A phrase in the alphabet of the Library of `locale`. */
export function normalizeQuery(text: string, locale: Locale): string {
  return normalizeText(text, ALPHABETS[locale]);
}

/** Distinct symbols of `text` that the Library of `locale` cannot hold (for a hint next to the search box). */
export function foreignSymbols(text: string, locale: Locale): string[] {
  const symbols = symbolsOf(ALPHABETS[locale]);
  const seen = new Set<string>();
  for (const c of text.normalize("NFC")) if (fold(c, symbols) === null) seen.add(c);
  return Array.from(seen);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/lib/babel.test.ts`
Expected: PASS.

- [ ] **Step 5: Home page counts** — in `src/app/[locale]/page.tsx` `NumbersSection` replace the `note:` of the alphabet entry:

```tsx
                note: t("alphabetNote", { letters: parts.letters.length, marks: parts.marks.length }),
```

- [ ] **Step 6: Texts** — in `messages/ru.json`:

```json
      "booksText": "Библиотека содержит все возможные комбинации {symbols, plural, one {# символа} few {# символов} many {# символов} other {# символа}}: строчных букв, пробела и шести знаков препинания. Каждая мыслимая книга уже написана."
      "alphabetNote": "{letters, plural, one {# строчная буква} few {# строчные буквы} many {# строчных букв} other {# строчной буквы}}, пробел и {marks, plural, one {# знак} few {# знака} many {# знаков} other {# знака}}: . , ! ? - :"
      "alphabetHint": "В Библиотеке только строчные русские буквы, пробел и знаки . , ! ? - : — заглавные станут строчными, переносы строк — пробелами",
      "typeInAlphabet": "Наберите текст русскими буквами."
```

and in `messages/en.json`:

```json
      "booksText": "The Library holds every possible combination of {symbols, plural, one {# symbol} other {# symbols}}: small letters, the space and six punctuation marks. Every conceivable book has already been written."
      "alphabetNote": "{letters, plural, one {# small letter} other {# small letters}}, the space and {marks, plural, one {# mark} other {# marks}}: . , ! ? - :"
      "alphabetHint": "The Library holds only small English letters, the space and . , ! ? - : — capitals become small, line breaks become spaces",
```

(`typeInAlphabet` exists only in ru.json — check with `Grep` for `typeInAlphabet` in `messages/en.json`; if it exists, make it "Type your text in English letters.")

- [ ] **Step 7: Verify** — `npm run typecheck`, `npm run lint`, `npm test`. Expected: all pass. (`addressText` still says "digits and Latin letters": that is the address alphabet, unchanged.)

---

### Task 2: Cells — the address ↔ cell bijection

**Files:**
- Modify: `tsconfig.json` (`"target": "ES2017"` → `"ES2020"`: BigInt literals)
- Create: `src/lib/world.ts`, `src/lib/world.test.ts`

**Interfaces:**
- Produces (exact names, used by plans 1–4):
  - `interface Cell { x: bigint; floor: bigint }`, `CENTRE: Cell`
  - `GALLERIES: bigint`, `addressIndex(hex: string): bigint`, `addressAt(index: bigint): string`
  - `cellOf(hex: string): Cell`, `addressOf(cell: Cell): string`
  - `offsetCell(cell: Cell, dx: number, dfloor: number): Cell`, `sameCell(a: Cell, b: Cell): boolean`
  - `cellKey(cell: Cell): string` (`"x:floor"`), `parseCellKey(key: string): Cell | null`
  - `cellNearCentre(random?: () => number): Cell`, `formatCoordinate(z: bigint): string`

- [ ] **Step 1: Bump the TypeScript target** — in `tsconfig.json` set `"target": "ES2020"`.

- [ ] **Step 2: Write the failing tests** — `src/lib/world.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DIGS, MAX_ADDRESS_LENGTH } from "./library";
import {
  CENTRE,
  GALLERIES,
  addressAt,
  addressIndex,
  addressOf,
  cellKey,
  cellNearCentre,
  cellOf,
  formatCoordinate,
  offsetCell,
  parseCellKey,
} from "./world";

const randomHex = (length: number) => Array.from({ length }, () => DIGS[Math.floor(Math.random() * DIGS.length)]).join("");

describe("gallery numbers", () => {
  it("count addresses by length, then as numbers", () => {
    expect(addressIndex("0")).toBe(0n);
    expect(addressIndex("Z")).toBe(61n);
    expect(addressIndex("00")).toBe(62n);
    expect(addressAt(0n)).toBe("0");
    expect(addressAt(62n)).toBe("00");
    expect(addressAt(GALLERIES - 1n)).toBe("Z".repeat(MAX_ADDRESS_LENGTH));
  });

  it("go both ways for addresses of every length", () => {
    for (const length of [1, 2, 7, 8, 9, 100, MAX_ADDRESS_LENGTH]) {
      const hex = randomHex(length);
      expect(addressAt(addressIndex(hex))).toBe(hex);
    }
  });
});

describe("cells", () => {
  it("give every address one cell, and that cell its address back", () => {
    for (const hex of ["babel", "0", "000", "Z", randomHex(1234), randomHex(MAX_ADDRESS_LENGTH)]) expect(addressOf(cellOf(hex))).toBe(hex);
  });

  it("give every cell its own address, near the centre and far away", () => {
    const seen = new Set<string>();
    for (let x = -6; x <= 6; x++) {
      for (let f = -6; f <= 6; f++) {
        const cell = { x: BigInt(x), floor: BigInt(f) };
        const hex = addressOf(cell);
        expect(cellOf(hex)).toEqual(cell);
        seen.add(hex);
      }
    }
    expect(seen.size).toBe(13 * 13);
    const far = { x: 10n ** 4000n + 7n, floor: -(10n ** 3999n) };
    expect(cellOf(addressOf(far))).toEqual(far);
  });

  it("give neighbours unrelated addresses, so their books do not share the start of every page", () => {
    const a = addressOf(CENTRE);
    for (const b of [addressOf(offsetCell(CENTRE, 1, 0)), addressOf(offsetCell(CENTRE, 0, 1))]) {
      let same = 0;
      for (let i = 0; i < 200; i++) if (a[i] === b[i]) same++;
      expect(same).toBeLessThan(20);
    }
  });

  it("travel as keys", () => {
    const cell = { x: -12n, floor: 10n ** 50n };
    expect(parseCellKey(cellKey(cell))).toEqual(cell);
    expect(cellKey({ x: 3n, floor: -4n })).toBe("3:-4");
    expect(parseCellKey("1:x")).toBeNull();
    expect(parseCellKey(`1:${"9".repeat(5001)}`)).toBeNull();
  });

  it("put newcomers near the centre", () => {
    for (let i = 0; i < 200; i++) {
      const c = cellNearCentre();
      expect(c.x >= -50n && c.x <= 50n && c.floor >= -20n && c.floor <= 20n).toBe(true);
    }
    expect(cellNearCentre(() => 0)).toEqual({ x: -50n, floor: -20n });
  });

  it("write coordinates for people", () => {
    expect(formatCoordinate(0n)).toBe("0");
    expect(formatCoordinate(-42n)).toBe("−42");
    expect(formatCoordinate(999999n)).toBe("999999");
    expect(formatCoordinate(31415926n)).toBe("3.14·10^7");
    expect(formatCoordinate(-(10n ** 4318n))).toBe("−1.00·10^4318");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -- src/lib/world.test.ts`
Expected: FAIL — cannot resolve `./world`.

- [ ] **Step 4: Write `src/lib/world.ts`**

```ts
import { DIGS, MAX_ADDRESS_LENGTH } from "./library";

/**
 * Where a gallery stands in the one Library: its column along its floor (galleries stand in rows, door to door) and
 * its floor. Whole numbers of any size: the Library is about 10^4318 galleries across.
 */
export interface Cell {
  x: bigint;
  floor: bigint;
}

export const CENTRE: Cell = { x: 0n, floor: 0n };

const BASE = BigInt(DIGS.length);
/** Eight digits at a time: 62^8 < 2^53, so a run of them is exact in a double. */
const RUN = 8;
const RUN_BASE = BASE ** BigInt(RUN);
const DIGIT = new Map(Array.from(DIGS, (d, i) => [d, i] as const));

/** How many galleries have an address shorter than `length` digits. */
const shorter = (length: bigint) => (BASE ** length - BASE) / (BASE - 1n);

/** How many galleries there are: one for every address of 1..MAX_ADDRESS_LENGTH digits. */
export const GALLERIES = shorter(BigInt(MAX_ADDRESS_LENGTH) + 1n);

/** n (≥ 0) in address digits, without leading zeros ("0" for zero). */
function toDigits(n: bigint): string {
  let out = "";
  do {
    let run = Number(n % RUN_BASE);
    n /= RUN_BASE;
    let part = "";
    for (let i = 0; i < RUN; i++) {
      part = DIGS[run % DIGS.length] + part;
      run = Math.floor(run / DIGS.length);
    }
    out = part + out;
  } while (n > 0n);
  return out.replace(/^0+(?=.)/, "");
}

/** Address digits as a number. */
function fromDigits(s: string): bigint {
  let n = 0n;
  for (let at = 0; at < s.length; ) {
    const width = at === 0 ? s.length % RUN || RUN : RUN;
    let run = 0;
    for (let i = at; i < at + width; i++) run = run * DIGS.length + (DIGIT.get(s[i]) ?? 0);
    n = n * (width === RUN ? RUN_BASE : BASE ** BigInt(width)) + BigInt(run);
    at += width;
  }
  return n;
}

/** Number of the gallery at an address: addresses ordered by length, then as numbers. */
export function addressIndex(hex: string): bigint {
  return shorter(BigInt(hex.length)) + fromDigits(hex);
}

/** Address of gallery number `index` (0 ≤ index < GALLERIES). */
export function addressAt(index: bigint): string {
  // shorter(length) ≤ index < shorter(length + 1)  ⇔  62^length ≤ 61·index + 62 < 62^(length + 1)
  const length = toDigits(index * (BASE - 1n) + BASE).length - 1;
  return toDigits(index - shorter(BigInt(length))).padStart(length, "0");
}

/** gcd(a, b) and the x with a·x ≡ gcd (mod b), 0 ≤ x < b. */
function gcdInverse(a: bigint, b: bigint): [bigint, bigint] {
  let [r0, r1, s0, s1] = [a, b, 1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return [r0, ((s0 % b) + b) % b];
}

/**
 * Addresses that share their first digits share the start of every page, so neighbouring galleries must not have
 * neighbouring numbers. A golden-ratio multiplier spreads them as far apart as any multiplier can; it is made coprime
 * with GALLERIES so that multiplying is a bijection, and UNMIX undoes it.
 */
const [MIX, UNMIX] = (() => {
  let mix = (GALLERIES * 618033988749894848n) / 10n ** 18n;
  for (;;) {
    const [gcd, inverse] = gcdInverse(mix, GALLERIES);
    if (gcd === 1n) return [mix, inverse];
    mix += 1n;
  }
})();
/** The centre of the Library is not its first address. */
const SHIFT = GALLERIES / 3n;

/** ⌊√n⌋ by Newton's method from above. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(16).length * 4 + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Whole numbers to naturals and back: 0, −1, 1, −2, 2 … ↔ 0, 1, 2, 3, 4 … */
const zig = (z: bigint) => (z >= 0n ? 2n * z : -2n * z - 1n);
const unzig = (n: bigint) => (n % 2n === 0n ? n / 2n : -(n + 1n) / 2n);

/** Szudzik's pairing: the square of side s holds exactly the numbers below s², so the centre gets the small ones. */
const pair = (a: bigint, b: bigint) => (a < b ? b * b + a : a * a + a + b);

function unpair(n: bigint): [bigint, bigint] {
  const s = isqrt(n);
  const r = n - s * s;
  return r < s ? [r, s] : [s, r - s];
}

/** The gallery an address names. */
export function cellOf(hex: string): Cell {
  const n = (UNMIX * ((((addressIndex(hex) - SHIFT) % GALLERIES) + GALLERIES) % GALLERIES)) % GALLERIES;
  const [a, b] = unpair(n);
  return { x: unzig(a), floor: unzig(b) };
}

/**
 * The address of the gallery at a cell. Past the square that holds every address (about 10^4318 galleries out) the
 * Library begins again — "unlimited and cyclical" — so every cell has a gallery.
 */
export function addressOf(cell: Cell): string {
  const n = pair(zig(cell.x), zig(cell.floor)) % GALLERIES;
  return addressAt((MIX * n + SHIFT) % GALLERIES);
}

export const offsetCell = (cell: Cell, dx: number, dfloor: number): Cell => ({ x: cell.x + BigInt(dx), floor: cell.floor + BigInt(dfloor) });

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.floor === b.floor;

/** "x:floor", the way cells travel in URLs, messages and the database. */
export const cellKey = (cell: Cell): string => `${cell.x}:${cell.floor}`;

export function parseCellKey(key: string): Cell | null {
  const m = /^(-?\d{1,5000}):(-?\d{1,5000})$/.exec(key);
  return m ? { x: BigInt(m[1]), floor: BigInt(m[2]) } : null;
}

/** A random gallery near the centre, where newcomers arrive: 101 columns by 41 floors. */
export function cellNearCentre(random: () => number = Math.random): Cell {
  const around = (r: number) => BigInt(Math.floor(random() * (2 * r + 1)) - r);
  return { x: around(50), floor: around(20) };
}

/** A coordinate for people: as it is up to six digits, then its first digits and its size. */
export function formatCoordinate(z: bigint): string {
  const sign = z < 0n ? "−" : "";
  const digits = (z < 0n ? -z : z).toString();
  if (digits.length <= 6) return sign + digits;
  return `${sign}${digits[0]}.${digits.slice(1, 3)}·10^${digits.length - 1}`;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/lib/world.test.ts`
Expected: PASS (≈1 s: each conversion of a full-length address takes ~2.5 ms).

- [ ] **Step 6: Verify** — `npm run typecheck`, `npm run lint`, `npm test`.

---

### Task 3: Rows of galleries — geometry

**Files:**
- Modify: `src/components/explore/geometry.ts:3-90` (constants, row, cells) and `:193-293` (walking)
- Create: `src/components/explore/geometry.test.ts`

**Interfaces:**
- Produces: `EAST_DOOR = 5`, `WEST_DOOR = 2`, `DOOR_SIDES`, `WALL_SIDES = [0, 1, 3, 4]`, `wallSide(wall: number): number`, `sideWall(side: number): number` (0 for a doorway), `ROW = { period, nx, nz, tx, tz }`, `interface WorldCell { level: number; col: number; vestibule: boolean }`, `galleryCenter(col: number, level: number): [number, number, number]`, `cellAt(feet): WorldCell`, `constrainWalk(feet, from): number` (same contract), unchanged `ROOM`, `STAIR`, `sideAngle`, `trackLevel`, `facingSide`, `sideYaw`, `viewpointForSide`, `closeupForSide`, `facingCenterRotation`, `yawTowards`, `hexagonShape`, `stairHeightAt`, `stairRampHeight`.
- Removed: `DOOR_INDEX`, `PAIR`, `GallerySide`, `galleryRotation` (Tasks 4–5 fix every user; until then typecheck fails in other files — expected, this task only checks its own tests).

- [ ] **Step 1: Write the failing tests** — `src/components/explore/geometry.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ROOM, ROW, STAIR, cellAt, constrainWalk, galleryCenter, sideAngle, sideWall, stairHeightAt, wallSide } from "./geometry";

const along = (col: number, s: number, l: number, level = 0) => {
  const [cx, cy, cz] = galleryCenter(col, level);
  return new THREE.Vector3(cx + ROW.nx * s + ROW.tx * l, cy, cz + ROW.nz * s + ROW.tz * l);
};

/** Walks the feet from `start` towards `goal` in small steps, as the controls do; returns where they end up. */
function walk(start: THREE.Vector3, goal: THREE.Vector3, steps = 3000): THREE.Vector3 {
  const feet = start.clone();
  const step = goal.clone().sub(start).divideScalar(steps);
  for (let i = 0; i < steps; i++) {
    const from = feet.clone();
    feet.add(step);
    feet.y = constrainWalk(feet, from);
  }
  return feet;
}

describe("walls and doors", () => {
  it("put walls 1..4 on sides 0, 1, 3, 4 and doorways on 2 and 5", () => {
    expect([1, 2, 3, 4].map(wallSide)).toEqual([0, 1, 3, 4]);
    expect([0, 1, 2, 3, 4, 5].map(sideWall)).toEqual([1, 2, 0, 3, 4, 0]);
  });
});

describe("a row of galleries", () => {
  it("knows which gallery, or which vestibule, the feet are in", () => {
    for (const [col, level] of [[0, 0], [3, -2], [-7, 5]]) {
      const [x, y, z] = galleryCenter(col, level);
      expect(cellAt({ x, y, z })).toEqual({ level, col, vestibule: false });
    }
    expect(cellAt(along(3, ROOM.apothem + ROOM.vestibuleDepth / 2, 0))).toEqual({ level: 0, col: 3, vestibule: true });
  });

  it("leads east through the vestibule into the next gallery, clear of the stair well", () => {
    const end = walk(along(0, ROOM.apothem - 0.7, 0.4), along(1, -(ROOM.apothem - 0.7), 0.4));
    expect(end.distanceTo(along(1, -(ROOM.apothem - 0.7), 0.4))).toBeLessThan(0.05);
    expect(cellAt(end)).toMatchObject({ col: 1, vestibule: false });
  });

  it("leads west into column −1 just the same", () => {
    const end = walk(along(0, -(ROOM.apothem - 0.7), 0.4), along(-1, ROOM.apothem - 0.7, 0.4));
    expect(cellAt(end)).toMatchObject({ col: -1, vestibule: false });
  });

  it("keeps the walker off the walls of shelves", () => {
    const a = sideAngle(wallSide(1));
    const [cx, , cz] = galleryCenter(4, 0);
    const start = new THREE.Vector3(cx + Math.cos(a) * 2.2, 0, cz + Math.sin(a) * 2.2);
    const end = walk(start, new THREE.Vector3(cx + Math.cos(a) * 6, 0, cz + Math.sin(a) * 6), 400);
    expect((end.x - cx) * Math.cos(a) + (end.z - cz) * Math.sin(a)).toBeLessThan(ROOM.apothem - 0.4);
  });

  it("puts the stair of every vestibule under the feet", () => {
    // In the well of the vestibule east of column 5, on its entry tread.
    const phi = STAIR.arc / 2;
    const feet = along(5, ROOM.apothem - STAIR.z, 0);
    feet.x += ROW.tx * (STAIR.x + Math.cos(phi) * 0.4) + ROW.nx * -Math.sin(phi) * 0.4;
    feet.z += ROW.tz * (STAIR.x + Math.cos(phi) * 0.4) + ROW.nz * -Math.sin(phi) * 0.4;
    feet.y = 0.2;
    const from = feet.clone();
    expect(constrainWalk(feet, from)).toBeCloseTo(stairHeightAt(phi, 0.2), 9);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- src/components/explore/geometry.test.ts`
Expected: FAIL — `wallSide` is not exported.

- [ ] **Step 3: Rewrite the constants and the row** — in `geometry.ts`:

Replace the comment on `ROOM` with `/** The hexagonal gallery, in metres. Sides 0, 1, 3, 4 carry shelves (walls 1..4); sides 2 and 5 are doorways. */` and replace `export const DOOR_INDEX = 5;` with:

```ts
/** The doorways: side 5 leads east to the next gallery of the row, side 2 west to the one before. */
export const EAST_DOOR = 5;
export const WEST_DOOR = 2;
export const DOOR_SIDES = [WEST_DOOR, EAST_DOOR] as const;
/** Side of each wall of shelves: wall n (1..4) stands on side WALL_SIDES[n − 1]. */
export const WALL_SIDES = [0, 1, 3, 4] as const;

export const wallSide = (wall: number): number => WALL_SIDES[wall - 1];

/** Wall (1..4) standing on side 0..5, 0 for a doorway. */
export const sideWall = (side: number): number => (WALL_SIDES as readonly number[]).indexOf(side) + 1;
```

Replace everything from `/** Two galleries share one vestibule …` (the `PAIR` block) through the end of `cellAt` with:

```ts
/**
 * The galleries of a floor stand in a row, door to door, a vestibule (closets, mirror, spiral stair) between each one
 * and the next; the rows repeat on every floor. `col` counts galleries along the row from the world's own, east +1.
 */
export const ROW = {
  /** Distance between the centres of two neighbouring galleries. */
  period: 2 * ROOM.apothem + ROOM.vestibuleDepth,
  /** Unit vector from the centre of a gallery through its east doorway. */
  nx: Math.cos(sideAngle(EAST_DOOR)),
  nz: Math.sin(sideAngle(EAST_DOOR)),
  /** Lateral unit vector across the doorways. */
  tx: -Math.sin(sideAngle(EAST_DOOR)),
  tz: Math.cos(sideAngle(EAST_DOOR)),
} as const;

export interface WorldCell {
  level: number;
  col: number;
  /** True in the vestibule east of gallery `col`. */
  vestibule: boolean;
}

/** World position of the centre of a gallery. Every gallery faces the same way. */
export function galleryCenter(col: number, level: number): [number, number, number] {
  return [ROW.nx * ROW.period * col, level * ROOM.level, ROW.nz * ROW.period * col];
}

/** Distance along the row from the west doorway of gallery 0. */
const rowDistance = (p: THREE.Vector3Like) => p.x * ROW.nx + p.z * ROW.nz + ROOM.apothem;

/** Which gallery (or the vestibule east of it) a feet position is in. Levels switch while the eyes pass through the slab. */
export function cellAt(feet: THREE.Vector3Like): WorldCell {
  const s = rowDistance(feet);
  const col = Math.floor(s / ROW.period);
  return { level: Math.round(feet.y / ROOM.level), col, vestibule: s - col * ROW.period > 2 * ROOM.apothem };
}
```

(`sideAngle` must be declared above `ROW`: it already is, right after `STAIR`.)

- [ ] **Step 4: Rewrite walking** — in `clampRoom` replace `if (i === DOOR_INDEX && Math.abs(lateral) < LANE_HALF) continue;` with:

```ts
    if ((i === EAST_DOOR || i === WEST_DOOR) && Math.abs(lateral) < LANE_HALF) continue;
```

and replace `constrainWalk` (from its doc comment to the end of the file) with:

```ts
/**
 * Keeps a walker inside the galleries of the rows, the vestibules between them and on their spiral staircases, on any
 * level. feet is the proposed feet position (mutated in place), from the last accepted one. Returns the height of the
 * floor or tread under the feet.
 */
export function constrainWalk(feet: THREE.Vector3, from: THREE.Vector3): number {
  const { nx, nz, tx, tz, period } = ROW;
  const depth = ROOM.vestibuleDepth;
  const levelFloor = Math.round(feet.y / ROOM.level) * ROOM.level;
  const col = Math.floor(rowDistance(feet) / period);
  const cx = nx * period * col;
  const cz = nz * period * col;
  // Corridor coordinates of the vestibule east of `col`: t is the depth beyond its doorway, l the lateral offset.
  const corridor = (p: THREE.Vector3Like) => rowDistance(p) - col * period - 2 * ROOM.apothem;
  let t = corridor(feet);
  let l = feet.x * tx + feet.z * tz;

  if (t < -0.1) {
    scratch.x = feet.x - cx;
    scratch.z = feet.z - cz;
    clampRoom(scratch, l);
    feet.x = cx + scratch.x;
    feet.z = cz + scratch.z;
    return levelFloor;
  }

  // The vestibule, up to the west doorway of the next gallery.
  const nearDoor = t < 0.25 || t > depth - 0.25;
  const maxL = nearDoor ? LANE_HALF : VESTIBULE_HALF;
  l = THREE.MathUtils.clamp(l, -maxL, maxL);

  // The stair well (vestibule-local z = -t, so the well is at depth -STAIR.z).
  const wellT = -STAIR.z;
  const dl = l - STAIR.x;
  const dt = t - wellT;
  const dist = Math.hypot(dl, dt);
  const phi = Math.atan2(-dt, dl);
  const fromT = corridor(from);
  const fromL = from.x * tx + from.z * tz;
  const wasInWell = Math.hypot(fromL - STAIR.x, fromT - wellT) < STAIR.wellRadius;
  const inWell = dist < STAIR.wellRadius;
  let ground = levelFloor;

  if (inWell) {
    const tread = stairHeightAt(phi, feet.y);
    const blocked = !wasInWell && (phi < STAIR.entryFrom || phi > STAIR.entryTo || Math.abs(tread - from.y) > STEP_TOLERANCE);
    if (blocked) {
      // The well guard: slide along the rim instead of stepping into the void.
      const r = STAIR.wellRadius + 0.02;
      l = STAIR.x + Math.cos(phi) * r;
      t = wellT - Math.sin(phi) * r;
    } else {
      const minR = STAIR.poleRadius + WALKER_RADIUS;
      if (dist < minR) {
        l = STAIR.x + Math.cos(phi) * minR;
        t = wellT - Math.sin(phi) * minR;
      }
      ground = tread;
    }
  } else if (wasInWell && Math.abs(levelFloor - from.y) > STEP_TOLERANCE) {
    // Leaving the stair anywhere but at a landing: the handrail keeps the walker on the treads.
    const r = STAIR.wellRadius - 0.02;
    l = STAIR.x + Math.cos(phi) * r;
    t = wellT - Math.sin(phi) * r;
    ground = stairHeightAt(phi, feet.y);
  }

  feet.x = cx + nx * (ROOM.apothem + t) + tx * l;
  feet.z = cz + nz * (ROOM.apothem + t) + tz * l;
  return ground;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/components/explore/geometry.test.ts`
Expected: PASS. (If the stair test is off, print `phi`, `STAIR.entryFrom/entryTo` and the corridor coordinates of `feet`; the entry tread must lie inside `[entryFrom, entryTo]`.)

- [ ] **Step 6: Note** — `npm run typecheck` now fails in the files Tasks 4 and 5 rewrite; that is expected. Do not "fix" them with shims.

---

### Task 4: Four walls of shelves in the scene and on the stage

**Files:**
- Modify: `src/lib/library.ts:5` (`walls: 4`)
- Modify: `src/components/explore/HexGalleryScene.tsx` — `DistantLevel` (`:285-298`), `GalleryRoom` (`:543-572`), comments mentioning "1..5"/"five walls"
- Modify: `src/components/explore/stage/ReadingDesk.tsx:28`, `src/components/explore/stage/deskFrame.ts:41-45,149-196`, `src/components/explore/stage/directorState.ts:59-63,88-92`
- Modify: `src/app/[locale]/(library)/explore/wall/[wall]/page.tsx:11,95-118`
- Modify: `src/components/explore/stage/deskFrame.test.ts`, `src/components/explore/stage/directorState.test.ts`
- Modify: `messages/ru.json` / `messages/en.json` `galleryText`

**Interfaces:**
- Consumes: `wallSide`, `sideWall`, `WALL_SIDES` (Task 3).
- Produces: every wall → angle conversion goes through `sideAngle(wallSide(wall))`, `sideYaw(wallSide(wall))`, `viewpointForSide(wallSide(wall))`, `closeupForSide(wallSide(wall), …)`.

- [ ] **Step 1: Update the tests first** — in `deskFrame.test.ts` and `directorState.test.ts` replace every `sideAngle(wall - 1)` with `sideAngle(wallSide(wall))`, `sideYaw(wall - 1)` with `sideYaw(wallSide(wall))`, `viewpointForSide(wall - 1)` with `viewpointForSide(wallSide(wall))`, import `wallSide` from `"../geometry"`, and make every loop over walls run `1..LIBRARY.walls` (import `LIBRARY` from `"@/lib/library"`) instead of `1..5`. The `["b", 1, 5, 1, 1]` case in `deskFrame.test.ts:114` becomes wall 4. (Gallery sides `"a"/"b"` stay until Task 5.)

- [ ] **Step 2: Four walls** — `src/lib/library.ts`: `walls: 4,`.

- [ ] **Step 3: The scene** — in `HexGalleryScene.tsx` import `WALL_SIDES` and `wallSide` from `./geometry`, and:

`DistantLevel`: replace `{Array.from({ length: 5 }, (_, i) => { const a = sideAngle(i); …` with `{WALL_SIDES.map((side) => { const a = sideAngle(side); …` and `key={side}`.

`GalleryRoom`: replace the walls loop and the desks with

```tsx
      {WALL_SIDES.map((side, i) => {
        const wall = i + 1;
        const a = sideAngle(side);
        const rot = facingCenterRotation(a);
        const r = ROOM.apothem;
        return (
          <group key={side}>
            <mesh position={[Math.cos(a) * r, ROOM.height / 2, Math.sin(a) * r]} rotation={[0, rot, 0]} material={wallPlane}>
              <planeGeometry args={[ROOM.radius + 0.02, ROOM.height]} />
            </mesh>
            <Bookcase
              wall={wall}
              seed={seed}
              position={[Math.cos(a) * BOOKCASE_RADIUS, 0, Math.sin(a) * BOOKCASE_RADIUS]}
              rotationY={rot}
              detail={detail && wall === detailWall ? detail : undefined}
              focusShelf={wall === detailWall ? focusShelf : undefined}
              hidden={hidden && wall === hidden.wall ? { shelf: hidden.shelf, volume: hidden.volume } : undefined}
              interactive={interactive}
              onHoverBook={onHoverBook}
              onClickBook={onClickBook}
              onHoverShelf={(s) => onHoverShelf?.(wall, s)}
              onClickShelf={(s) => onClickShelf?.(wall, s)}
            />
          </group>
        );
      })}
      <Railing />
      {WALL_SIDES.map((_, i) => (
        <ReadingDesk key={i} wall={i + 1} lit={i + 1 === deskLampWall} />
      ))}
```

The doorway sides (2 and 5) get no wall plane: the vestibules on both sides draw the door frames (`VestibuleShell` already draws them at both of its ends). `shelfSpotAt`: `const a = sideAngle(wallSide(wall));`. Fix the doc comments: "Wall (1..4)", "four walls of shelves".

- [ ] **Step 4: The stage** — `ReadingDesk.tsx:28`: `const a = sideAngle(wallSide(wall));`. `deskFrame.ts`: `towardsWall` uses `sideAngle(wallSide(wall))`; `visitorAtDesk` uses `sideYaw(wallSide(wall))`; `closeupPose` uses `closeupForSide(wallSide(wall), CLOSEUP_DISTANCE)` and `sideYaw(wallSide(wall))`; `shelfBookPose` uses `facingCenterRotation(sideAngle(wallSide(wall)))`. `directorState.ts`: `acrossFromWall` uses `viewpointForSide(wallSide(wall))` and `sideYaw(wallSide(wall))`; `intoRoom` uses `sideAngle(wallSide(wall))`. Update "1..5" in their comments to "1..4".

- [ ] **Step 5: The walk page** — `src/app/[locale]/(library)/explore/wall/[wall]/page.tsx`: import `sideWall, sideYaw, wallSide` (drop `DOOR_INDEX`); in `selectWall` use `sideYaw(wallSide(w))`; `onFacingSide` becomes

```ts
  const onFacingSide = useCallback(
    (side: number) => {
      const w = sideWall(side);
      setFacingWall(w);
      if (!w) return; // a doorway: the title says "Vestibule"
      lastWallRef.current = w;
      window.history.replaceState(null, "", localizedPath(`/explore/wall/${w}${hexQuery()}`));
    },
    [localizedPath]
  );
```

- [ ] **Step 6: Texts** — `messages/ru.json` `galleryText`: "Каждая галерея имеет шесть стен. Четыре из них заняты полками; две другие — двери в вестибюли: к зеркалу, винтовой лестнице и соседним галереям того же этажа." `messages/en.json`: "Every gallery has six walls. Four of them are lined with shelves; the other two open onto vestibules with a mirror, a spiral staircase and the neighbouring galleries of the same floor." Also the walk hint (`hintDesktop`, both files): replace "дальняя дверь — в соседнюю" / "the far door leads to the next one" with "двери — в соседние галереи этажа" / "the doors lead to the neighbouring galleries of the floor".

- [ ] **Step 7: Verify** — `npm test -- src/components/explore/stage` must pass for the wall-related tests; `npm run typecheck` still reports only `GallerySide`/`PAIR`/`galleryRotation`/`DOOR_INDEX` errors (Task 5). Grep `src` for `wall - 1` and `length: 5`: no wall-related matches may remain (`PageNavigation.tsx:31` is address arithmetic, not a side — leave it).

---

### Task 5: The world streams rows and floors around its anchor

**Files:**
- Create: `src/components/explore/worldAddresses.ts`, `src/components/explore/worldAddresses.test.ts`
- Modify: `src/components/explore/HexGalleryScene.tsx` (types, vestibule frames, light pool, cells, world)
- Modify: `src/components/explore/stage/deskFrame.ts:87-196`, `directorState.ts:15-16,59-63,88-92`, `stageStore.ts:73-74`, `Director.tsx` (every `side`), and the tests `deskFrame.test.ts`, `directorState.test.ts`, `stageStore.test.ts`
- Modify: `src/app/[locale]/(library)/explore/wall/[wall]/page.tsx:63-67,121-130,139-141`
- Modify: `src/lib/hex.ts` (remove `cellHex`)

**Interfaces:**
- Consumes: `cellOf`, `addressOf`, `offsetCell`, `Cell` (Task 2); `ROW`, `galleryCenter(col, level)`, `cellAt`, `EAST_DOOR`, `WALL_SIDES` (Task 3).
- Produces:
  - `interface WorldAddresses { anchor: Cell; hexAt(col: number, level: number): string }`, `worldAddresses(worldHex: string): WorldAddresses`
  - `interface WorldPlace { level: number; col: number; hex: string; cell: Cell }` (HexGalleryScene) — plans 2–4 read `place.cell` from the stage store.
  - `interface HiddenVolume { level: number; col: number; wall: number; shelf: number; volume: number }`
  - `START = { level: 0, col: 0 }` (directorState)
  - `galleryToWorld(level, col, p, out?)`, `deskFrame(level, col, wall)`, `visitorAtDesk(level, col, wall)`, `closeupPose(level, col, wall, shelf)`, `shelfBookPose(level, col, wall, shelf, volume, seed)`, `intoRoom(wall)` — `galleryYaw` is removed (every gallery faces the same way).

- [ ] **Step 1: Failing test for the address cache** — `src/components/explore/worldAddresses.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addressOf, cellOf, offsetCell } from "@/lib/world";
import { worldAddresses } from "./worldAddresses";

describe("worldAddresses", () => {
  it("names the world's own gallery by its address, however short", () => {
    const world = worldAddresses("babel");
    expect(world.hexAt(0, 0)).toBe("babel");
    expect(world.anchor).toEqual(cellOf("babel"));
  });

  it("finds the address of any gallery around the anchor, and the same one every time", () => {
    const world = worldAddresses("babel");
    const hex = world.hexAt(2, -3);
    expect(hex).toBe(addressOf(offsetCell(cellOf("babel"), 2, -3)));
    expect(world.hexAt(2, -3)).toBe(hex);
    expect(cellOf(hex)).toEqual(offsetCell(world.anchor, 2, -3));
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npm test -- src/components/explore/worldAddresses.test.ts` → FAIL (no module).

- [ ] **Step 3: Write `src/components/explore/worldAddresses.ts`**

```ts
import { addressOf, cellOf, offsetCell, type Cell } from "@/lib/world";

/** The galleries of a world built around one address: where that address stands, and the address of any gallery near it. */
export interface WorldAddresses {
  anchor: Cell;
  /** Address of the gallery `col` along the row and `level` floors up from the anchor. */
  hexAt(col: number, level: number): string;
}

/**
 * An address takes a few milliseconds to work out, so each is worked out once per world.
 * ponytail: the cache grows by one ~5 KB string per gallery visited; a reload clears it.
 */
export function worldAddresses(worldHex: string): WorldAddresses {
  const anchor = cellOf(worldHex);
  const known = new Map<string, string>([["0:0", worldHex]]);
  return {
    anchor,
    hexAt(col, level) {
      const key = `${col}:${level}`;
      let hex = known.get(key);
      if (hex === undefined) {
        hex = addressOf(offsetCell(anchor, col, level));
        known.set(key, hex);
      }
      return hex;
    },
  };
}
```

Run the test again → PASS.

- [ ] **Step 4: Stage helpers by column** — `deskFrame.ts`: import `galleryCenter` only (drop `galleryRotation`, `GallerySide`); delete `galleryYaw`; then:

```ts
/** A gallery-local point of the gallery at (level, col), in the world. Every gallery faces the same way. */
export function galleryToWorld(level: number, col: number, p: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 {
  const [cx, cy, cz] = galleryCenter(col, level);
  return out.set(p.x + cx, p.y + cy, p.z + cz);
}

/** The book space of the desk facing wall 1..4 in the gallery at (level, col): book +z points at the wall. */
export function deskFrame(level: number, col: number, wall: number): DeskFrame {
  return { position: galleryToWorld(level, col, deskCenterLocal(wall)), yaw: deskYaw(wall), scale: BOOK_SCALE };
}
```

`visitorAtDesk(level, col, wall)`: `position: galleryToWorld(level, col, eye, eye), yaw: sideYaw(wallSide(wall))`. `closeupPose(level, col, wall, shelf)`: `const yaw = sideYaw(wallSide(wall));` and `galleryToWorld(level, col, …)`. `shelfBookPose(level, col, wall, shelf, volume, seed)`: `galleryToWorld(level, col, center, center)` and `quaternion: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, caseYaw).multiply(ON_SHELF)`.

`directorState.ts`: `export const START = { level: 0, col: 0 } as const;` with the comment "A world is built around its address: the visitor starts in that gallery, column 0 of level 0."; `acrossFromWall`: `galleryToWorld(START.level, START.col, { x, y, z })`, `yaw: sideYaw(wallSide(wall))`; `intoRoom(wall: number)`: `return new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));` (no turning). Drop the `GallerySide`/`galleryYaw` imports.

`stageStore.ts` `samePlace`: compare `a.level === b.level && a.col === b.col && a.hex === b.hex`.

Tests: in `deskFrame.test.ts` loops over `["a", "b"]` become loops over columns `[0, -3]`, `galleryCenter(side, level)` becomes `galleryCenter(col, level)`, `gallery.rotation.y = galleryRotation(side)` lines are deleted; `directorState.test.ts` drops `galleryYaw(START.side)` from the expected yaw and uses `START.col`; `stageStore.test.ts:38-39` places become `{ level: 1, col: 2, hex: "x", cell: { x: 0n, floor: 0n } }`.

- [ ] **Step 5: The world** — in `HexGalleryScene.tsx`:

Imports: `import { offsetCell, type Cell } from "@/lib/world";`, `import { worldAddresses, type WorldAddresses } from "./worldAddresses";`, from `./geometry` take `EAST_DOOR, ROOM, ROW, STAIR, WALL_SIDES, cellAt, constrainWalk, facingCenterRotation, facingSide, galleryCenter, hexagonShape, sideAngle, stairRampHeight, trackLevel, wallSide` (drop `cellHex`, `DOOR_INDEX`, `galleryRotation`, `GallerySide`).

Types:

```ts
export interface WorldPlace {
  level: number;
  /** Galleries along the row from the one the world was built around, east +1. */
  col: number;
  /** Address of the gallery the visitor is in (or was in last, while crossing a vestibule). */
  hex: string;
  /** Where that gallery stands in the Library. */
  cell: Cell;
}

/** A volume that is off its shelf, and the gallery it belongs to. */
export interface HiddenVolume {
  level: number;
  col: number;
  wall: number;
  shelf: number;
  volume: number;
}
```

and `initialPlace?: { level: number; col: number };` in `GalleryWorldProps`; `onFacingSide` doc: "Side (0..5) of the current gallery the visitor is facing; 2 and 5 are doorways."

Vestibule frames:

```ts
/** Position (world) and rotation.y of the vestibule east of gallery `col` on a level. */
function vestibuleFrame(col: number, level: number): { position: [number, number, number]; rotation: number } {
  const a = sideAngle(EAST_DOOR);
  const [cx, cy, cz] = galleryCenter(col, level);
  return { position: [cx + Math.cos(a) * ROOM.apothem, cy, cz + Math.sin(a) * ROOM.apothem], rotation: facingCenterRotation(a) };
}

/** World position of a point given in the frame of the vestibule east of `col`. */
function vestibulePoint(col: number, level: number, x: number, y: number, z: number): [number, number, number] {
  const { position, rotation } = vestibuleFrame(col, level);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [position[0] + x * c + z * s, position[1] + y, position[2] - x * s + z * c];
}
```

`shelfSpotAt(level: number, col: number, wall: number, shelf: number)` with `galleryToWorld(level, col, …)`.

`LightPool` (still 11 lights — keys by index so no light ever remounts):

```tsx
function LightPool({
  level,
  col,
  shelfSpot,
  deskLamp,
  deskLightRef,
}: {
  level: number;
  col: number;
  shelfSpot: { wall: number; shelf: number } | null;
  deskLamp: { wall: number; intensity: number } | null;
  deskLightRef?: Ref<THREE.PointLight>;
}) {
  const y = level * LEVEL_H;
  const lamps: [number, number, number][] = [];
  for (const c of [col - 1, col, col + 1]) {
    const [gx, , gz] = galleryCenter(c, level);
    lamps.push([gx + 2.3, y + 3.05, gz], [gx - 2.3, y + 3.05, gz]);
  }
  const [cx, , cz] = galleryCenter(col, level);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const spotWall = shelfSpot?.wall ?? 1;
  const spotShelf = shelfSpot?.shelf ?? 1;
  const spot = useMemo(() => shelfSpotAt(level, col, spotWall, spotShelf), [level, col, spotWall, spotShelf]);
  const deskLampWall = deskLamp?.wall ?? 1;
  const deskLampPos = useMemo(() => galleryToWorld(level, col, deskLampLocal(deskLampWall)).toArray(), [level, col, deskLampWall]);
  return (
    <group>
      {lamps.map((p, i) => (
        <pointLight key={`lamp${i}`} position={p} color={LAMP_COLOR} intensity={13} distance={13} decay={2} />
      ))}
      <pointLight position={[cx, y + 2.4, cz]} color="#e9c99a" intensity={3} distance={10} decay={2} />
      {[col - 1, col].map((c, i) => (
        <pointLight key={`v${i}`} position={vestibulePoint(c, level, 0.5, 3.05, -ROOM.vestibuleDepth / 2)} color={LAMP_COLOR} intensity={4} distance={13} decay={2} />
      ))}
      <primitive object={spotTarget} position={spot.target} />
      <spotLight position={spot.position} target={spotTarget} angle={0.4} penumbra={0.8} intensity={shelfSpot ? 38 : 0} distance={8} decay={2} color="#ffdcae" />
      <pointLight ref={deskLightRef} position={deskLampPos} color={LAMP_COLOR} intensity={deskLamp?.intensity ?? 0} distance={3} decay={2} />
    </group>
  );
}
```

Update the comment above it: "the lamps of the visitor's gallery and its two neighbours, the fill light of the visitor's gallery, the lamps of the two vestibules beside it, …".

`GalleryCell`: props `addresses: WorldAddresses; col: number; level: number` instead of `worldHex, level, side`; `const seed = useMemo(() => hashString(addresses.hexAt(col, level)), [addresses, col, level]);`; the group is `<group position={galleryCenter(col, level)}>` (no rotation).

`VestibuleCell`:

```tsx
/** The vestibule east of a gallery, dressed like that gallery. */
const VestibuleCell = memo(function VestibuleCell({ addresses, col, level }: { addresses: WorldAddresses; col: number; level: number }) {
  const seed = useMemo(() => hashString(addresses.hexAt(col, level)), [addresses, col, level]);
  const frame = vestibuleFrame(col, level);
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        <group position={frame.position} rotation={[0, frame.rotation, 0]}>
          <VestibuleShell full />
        </group>
      </LibraryMaterialsProvider>
    </Suspense>
  );
});
```

`DistantWorld`:

```tsx
/**
 * The galleries beyond the near ones, cheap and dressed like the visitor's: the far levels of the visitor's column and
 * its neighbours (seen through the shafts), and the galleries two doors away on the near levels.
 * ponytail: ~30 separate far levels; merge them into instanced meshes if frame time suffers.
 */
const DistantWorld = memo(function DistantWorld({ seed, col, level }: { seed: number; col: number; level: number }) {
  const cells = useMemo(() => {
    const out: [number, number][] = [];
    for (let k = level - ROOM.levelsBelow; k <= level + ROOM.levelsAbove; k++) {
      for (let c = col - 2; c <= col + 2; c++) {
        const near = Math.abs(c - col) <= 1 && Math.abs(k - level) <= 1;
        if (!near && (Math.abs(c - col) <= 1 || Math.abs(k - level) <= 1)) out.push([c, k]);
      }
    }
    return out;
  }, [col, level]);
  return (
    <Suspense fallback={null}>
      <LibraryMaterialsProvider seed={seed}>
        {cells.map(([c, k]) => {
          const shaft = (c === col - 1 || c === col) && Math.abs(k - level) > 1;
          const frame = vestibuleFrame(c, k);
          return (
            <Fragment key={`${c}:${k}`}>
              <group position={galleryCenter(c, k)}>
                <DistantLevel />
              </group>
              {shaft && (
                <group position={frame.position} rotation={[0, frame.rotation, 0]}>
                  <VestibuleShell full={false} />
                </group>
              )}
            </Fragment>
          );
        })}
      </LibraryMaterialsProvider>
    </Suspense>
  );
});
```

`GalleryWorld` body (props unchanged apart from `initialPlace`):

```tsx
  const addresses = useMemo(() => worldAddresses(worldHex), [worldHex]);
  const [current, setCurrent] = useState<{ level: number; col: number }>(() => initialPlace ?? { level: 0, col: 0 });
  const currentRef = useRef(current);
  // The one real mirror hangs in the vestibule on the visitor's side of their gallery.
  const [mirrorCol, setMirrorCol] = useState(current.col);
  const mirrorColRef = useRef(mirrorCol);
```

`onFrame` (deps `[addresses]`):

```ts
      const cur = currentRef.current;
      feet.current.set(position.x, position.y - ROOM.eyeHeight, position.z);
      const cell = cellAt(feet.current);
      const level = trackLevel(feet.current.y, cur.level);
      // Crossing a vestibule the visitor is still in the gallery they came from.
      const col = cell.vestibule ? cur.col : cell.col;
      if (level !== cur.level || col !== cur.col) {
        const next = { level, col };
        currentRef.current = next;
        setCurrent(next);
        callbacks.current.onPlace?.({ ...next, hex: addresses.hexAt(col, level), cell: offsetCell(addresses.anchor, col, level) });
        lastSide.current = -1;
      }
      const [gx, , gz] = galleryCenter(cell.col, 0);
      const east = (feet.current.x - gx) * ROW.nx + (feet.current.z - gz) * ROW.nz >= 0;
      const mirror = cell.vestibule || east ? cell.col : cell.col - 1;
      if (mirror !== mirrorColRef.current) {
        mirrorColRef.current = mirror;
        setMirrorCol(mirror);
      }
      const s = facingSide(yaw);
```

Render (replace from `const levels = …` to the end of the returned group):

```tsx
  const levels = useMemo(() => [current.level - 1, current.level, current.level + 1], [current.level]);
  const cols = useMemo(() => [current.col - 1, current.col, current.col + 1], [current.col]);
  const currentSeed = useMemo(() => hashString(addresses.hexAt(current.col, current.level)), [addresses, current]);
  const mirrorFrame = vestibuleFrame(mirrorCol, current.level);

  return (
    <group>
      {/* GalleryControls, PreloadAllTextures, fog and hemisphere light exactly as before */}
      <LightPool level={current.level} col={current.col} shelfSpot={shelfSpot} deskLamp={deskLamp} deskLightRef={deskLightRef} />

      {levels.map((k) =>
        cols.map((c) => {
          const here = k === current.level && c === current.col;
          return (
            <GalleryCell
              key={`${c}:${k}`}
              addresses={addresses}
              col={c}
              level={k}
              interactive={here && interactive !== "none"}
              detail={here ? detail : null}
              hidden={hidden && hidden.level === k && hidden.col === c ? hidden : null}
              deskLampWall={here ? deskLamp?.wall : undefined}
              onReady={here ? reportCellReady : undefined}
              onHoverBook={onHoverBook}
              onClickBook={onClickBook}
              onHoverShelf={onHoverShelf}
              onClickShelf={onClickShelf}
            />
          );
        })
      )}
      {levels.map((k) => [current.col - 1, current.col].map((c) => <VestibuleCell key={`v${c}:${k}`} addresses={addresses} col={c} level={k} />))}
      {[current.col - 2, current.col + 1].map((c) => (
        <VestibuleCell key={`v${c}:${current.level}`} addresses={addresses} col={c} level={current.level} />
      ))}

      {/* The stairs of the two vestibules beside the visitor's gallery; one turn is one level, so they only ever move by whole levels. */}
      {[current.col - 1, current.col].map((c) => {
        const frame = vestibuleFrame(c, current.level);
        return (
          <group key={`stair${c}`} position={frame.position} rotation={[0, frame.rotation, 0]}>
            <Staircase />
          </group>
        );
      })}
      <group position={mirrorFrame.position} rotation={[0, mirrorFrame.rotation, 0]}>
        <Mirror />
      </group>

      <DistantWorld seed={currentSeed} col={current.col} level={current.level} />
    </group>
  );
```

Keys are absolute `(col, level)` strings, so a gallery that stays near never remounts when the visitor moves on.

- [ ] **Step 6: The director** — in `Director.tsx`: `type Place = { level: number; col: number };`; import `cellOf` from `@/lib/world` and drop the `GallerySide` import; then fix every compile error `npm run typecheck` reports there. The known sites:
  - `:127` `closeupShot` → `closeupPose(place.level, place.col, wall, shelf)`
  - `:252-253`, `:518-521` → `closeupPose(…, place.col, …)`, `visitorAtDesk(START.level, START.col, wall)`, `deskFrame(START.level, START.col, …)`
  - `:514` → `store.patch({ place: { ...START, hex, cell: cellOf(hex) } });`
  - `:534` → `const here: Place = { level: place.level, col: place.col };`
  - `:551-552`, `:931` → `deskFrame(here.level, here.col, wall)`, `shelfBookPose(here.level, here.col, …)`, `deskFrame(place.level, place.col, staged.desk)`
  - `:570`, `:594`, `:620`, `:628` → `intoRoom(book.wall)` / `intoRoom(from.book.wall)` / `intoRoom(target.book.wall)`
  - `:761` → `setHiddenVolume({ level: place.level, col: place.col, wall, shelf, volume })`
  - `:802-812` → `const col = shown?.place.col ?? START.col;` and `{ level, col, wall: offWall, … }` with `[level, col, …]` deps

- [ ] **Step 7: The walk page** — `src/app/[locale]/(library)/explore/wall/[wall]/page.tsx`:

```ts
  const [place, setPlace] = useState<WorldPlace>(() => {
    const known = store.getSnapshot().place;
    return known && known.hex === hex ? known : { level: 0, col: 0, hex, cell: cellOf(hex) };
  });
```

`onPlace`'s banner: `next.level > prev.level ? t("bannerUp") : next.level < prev.level ? t("bannerDown") : t("bannerNext")` stays (a column change is "next"). Import `cellOf` from `@/lib/world`.

- [ ] **Step 8: Remove `cellHex`** from `src/lib/hex.ts` (nothing uses it now; `createRandom`/`hashString`/`shortHex`/`generateRandomHex` stay).

- [ ] **Step 9: Verify** — `npm run typecheck`, `npm run lint`, `npm test` all pass.

- [ ] **Step 10: Look at it** — with the user's dev server running, open `http://localhost:3000/explore/wall/1?hex=babel` in Chrome (front), wait for the veil to lift, and in the console: `window.__gallery.current.teleport({x: 0, y: 1.6, z: 0}, 0)` is inside the shaft — use instead the walk from the east door: `const n = [Math.cos(-Math.PI/6), Math.sin(-Math.PI/6)]; window.__gallery.current.teleport({x: n[0]*2.7 + 0.4*-n[1], y: 1.6, z: n[1]*2.7 + 0.4*n[0]}, Math.atan2(-n[0], -n[1]))` and screenshot: a doorway, the vestibule with its stair and mirror, and the next gallery beyond. Repeat facing west (yaw + π). `list_console_messages` must show no errors. Check that the URL's `?hex=` changes when the visitor is teleported into the next gallery (`teleport` 9.73 m further east) — the director must not rebuild (no veil).

---

### Task 6: Spawn near the centre, coordinates in the HUD, the way back to the centre

**Files:**
- Modify: the three explore pages (`wall/[wall]/page.tsx:35`, `shelf/[shelf]/page.tsx:33`, `volume/[volume]/page.tsx:62`)
- Modify: `src/app/[locale]/(library)/explore/wall/[wall]/page.tsx` (kicker, label, centre button)
- Modify: `messages/ru.json`, `messages/en.json` (`Gallery.kickerCell`, `Gallery.toCentre`)

**Interfaces:**
- Consumes: `addressOf`, `cellNearCentre`, `CENTRE`, `formatCoordinate` (Task 2); `WorldPlace.cell` (Task 5).
- Produces: `spawnHex(): string` in `src/lib/world.ts` (plan 2 replaces its use on the walk page with the server's last place).

- [ ] **Step 1: Test** — add to `src/lib/world.test.ts`:

```ts
  it("spawns at an address near the centre", () => {
    const cell = cellOf(spawnHex());
    expect(cell.x >= -50n && cell.x <= 50n && cell.floor >= -20n && cell.floor <= 20n).toBe(true);
  });
```

(import `spawnHex`). Run → FAIL.

- [ ] **Step 2: Implement** — in `world.ts`:

```ts
/** The address a visitor without one arrives at. */
export const spawnHex = (): string => addressOf(cellNearCentre());
```

Run → PASS.

- [ ] **Step 3: Pages** — in the three explore pages replace `generateRandomHex()` with `spawnHex()` (import from `@/lib/world`; drop the `generateRandomHex` import where unused). `browse/page.tsx` keeps `generateRandomHex(100)`: it picks a random page, not a gallery.

- [ ] **Step 4: Where am I** — on the walk page:

```ts
  const kicker = t("kickerCell", { x: formatCoordinate(place.cell.x), floor: formatCoordinate(place.cell.floor) });
```

and add a button to the bottom bar, after the wall selector:

```tsx
        <HudButton onClick={() => router.push(`/explore/wall/1?hex=${addressOf(CENTRE)}`)} title={t("toCentreTitle")}>
          {t("toCentre")}
        </HudButton>
```

(import `HudButton` from ExploreHud, `CENTRE`, `addressOf`, `formatCoordinate` from `@/lib/world`).

Messages — `Gallery` in `ru.json`: `"kickerCell": "Галерея {x} · этаж {floor}"`, `"toCentre": "К центру"`, `"toCentreTitle": "В галерею 0 · 0, в центр Библиотеки"`; `en.json`: `"kickerCell": "Gallery {x} · floor {floor}"`, `"toCentre": "To the centre"`, `"toCentreTitle": "To gallery 0 · 0, the centre of the Library"`. Remove `kickerFloor` from both (grep first: nothing else may use it).

- [ ] **Step 5: Verify** — typecheck, lint, test. In Chrome: open `http://localhost:3000/explore/wall/1` (no hex): the URL gets a 4819-digit `hex` and the kicker shows small coordinates (|x| ≤ 50, |floor| ≤ 20). Click "To the centre": the kicker reads "Gallery 0 · floor 0". Walk east through a doorway: x grows by one.

---

### Task 7: README

**Files:**
- Modify: `README.md`, `README.en.md`

- [ ] **Step 1:** Read both READMEs. Update every statement about: five walls (now four, two doors, rows of galleries on every floor), the spawn-relative world (now one Library with coordinates: "every address has a place; the centre is gallery 0 · 0; addresses near each other in the Library are unrelated"), and the alphabets (166/98 → 40/33: small letters, space, `. , ! ? - :`; capitals and line breaks are folded; addresses are now one digit per symbol, 4819 long). Keep the existing tone and both languages in step. Do not touch screenshots (a later task re-takes them).

- [ ] **Step 2: Verify** — `npm run lint` (README is not linted, but run the trio once more) and ask the user whether to commit, suggesting three commits: alphabet; world coordinates + geometry; scene/stage/pages + README.
