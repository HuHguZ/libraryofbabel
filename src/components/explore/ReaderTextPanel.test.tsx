import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useReducer, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChakraProvider } from "@chakra-ui/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/ru.json";
import { system } from "@/lib/theme";
import { LIBRARY } from "@/lib/library";
import { PAGE_TEXT_ATTR, fragmentFromSelection, fragmentReducer, shownFragment, type FragmentState, type TextFragment } from "@/lib/fragment";
import ReaderTextPanel from "./ReaderTextPanel";

// Links need the Next.js router; the panel's selection handling does not.
vi.mock("@/components/LibraryNav", () => ({ default: () => null }));
vi.mock("@/components/AddressDisplay", () => ({ default: () => null }));

/** A page of text as the Library gives it: 4819 characters, different on every page. */
const pageText = (page: number) => {
  const letters = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя .,!?";
  return Array.from({ length: LIBRARY.pageLength }, (_, i) => letters[(i * 7 + page * 13 + ((i * i) % 11)) % letters.length]).join("");
};
const contents = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, pageText(i + 1)]));

/**
 * The reader around the text panel, wired as on the reader page: the fragment state, the spread it shows,
 * page turns. `settleOnTurn` is what the page does on a turn; without it, only the panel itself can notice
 * that the selected text went away.
 */
function Reader({ settleOnTurn, spy }: { settleOnTurn: boolean; spy: { state: FragmentState } }) {
  const [spread, setSpread] = useState(4);
  const [state, dispatch] = useReducer(fragmentReducer, { mark: null, live: null });
  spy.state = state;
  const turn = (dir: 1 | -1) => {
    if (settleOnTurn) dispatch({ type: "settle" });
    setSpread((k) => k + dir);
  };
  const pages = [2 * spread, 2 * spread + 1];
  return (
    <>
      <button onClick={() => turn(-1)}>prev</button>
      <button onClick={() => turn(1)}>next</button>
      <ReaderTextPanel
        hex="babel"
        wall={1}
        shelf={3}
        volume={18}
        pages={pages}
        contents={contents}
        query=""
        page={pages[1]}
        address={`babel-1-3-18-${pages[1]}`}
        fragment={state.mark}
        live={state.live}
        shareUrl=""
        scrollToken={0}
        currentMatch={null}
        matchScrollToken={0}
        onSelection={(fragment) => dispatch({ type: "select", fragment })}
        onShare={() => dispatch({ type: "settle" })}
        onShow={() => {}}
        onClear={() => dispatch({ type: "clear" })}
        onClose={() => {}}
      />
    </>
  );
}

function renderReader(settleOnTurn: boolean) {
  const spy = { state: { mark: null, live: null } as FragmentState };
  render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <ChakraProvider value={system}>
        <Reader settleOnTurn={settleOnTurn} spy={spy} />
      </ChakraProvider>
    </NextIntlClientProvider>
  );
  return spy;
}

const pageTextElement = (page: number) => document.querySelector<HTMLElement>(`[${PAGE_TEXT_ATTR}="${page}"]`);

/** Selects characters of a page in the panel, as a mouse drag would, and lets the panel read the selection. */
function selectText(page: number, start: number, end: number) {
  const el = pageTextElement(page)!;
  const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(100);
  });
}

/** Turns a page the way the browser does it: the old text leaves the DOM and no selectionchange event follows. */
function turn(dir: 1 | -1) {
  act(() => {
    fireEvent.click(screen.getByText(dir === 1 ? "next" : "prev"));
  });
}

/** The fragment the text panel shows: the live selection in its text, or else the marked run of characters. */
function panelShows(state: FragmentState): TextFragment | null {
  const selected = fragmentFromSelection(document.body, document.getSelection());
  if (selected) return selected;
  const mark = state.mark;
  const el = mark && pageTextElement(mark.page);
  const marked = el ? [...el.querySelectorAll("mark[data-fragment]")].map((m) => m.textContent).join("") : "";
  return mark && marked && marked === contents[mark.page].slice(mark.start, mark.end) ? mark : null;
}

describe("ReaderTextPanel selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    document.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  it("reads a selection as page offsets", () => {
    const spy = renderReader(true);
    selectText(9, 100, 180);
    expect(spy.state).toEqual({ mark: null, live: { page: 9, start: 100, end: 180 } });
    expect(panelShows(spy.state)).toEqual(shownFragment(spy.state));
  });

  // Regression: select text, turn the page, turn back. The 3D book kept the highlight, the panel lost it.
  describe.each([
    ["the reader page marks the selection on a turn", true],
    ["only the panel notices the selected text is gone", false],
  ])("select, turn the page and turn back: %s", (_, settleOnTurn) => {
    it("keeps the fragment marked in the panel, the same one the 3D book shows", () => {
      const spy = renderReader(settleOnTurn);
      const fragment = { page: 9, start: 100, end: 180 };
      selectText(9, 100, 180);

      turn(1);
      expect(pageTextElement(9)).toBeNull();
      expect(spy.state).toEqual({ mark: fragment, live: null });

      turn(-1);
      expect(shownFragment(spy.state)).toEqual(fragment);
      expect(panelShows(spy.state)).toEqual(fragment);
      expect(pageTextElement(9)!.hasAttribute("data-selecting")).toBe(false);
    });
  });

  it("clears the mark with ✕", () => {
    const spy = renderReader(true);
    selectText(9, 10, 20);
    turn(1);
    turn(-1);
    act(() => {
      fireEvent.click(screen.getByTitle(messages.Reader.clearFragment));
    });
    expect(spy.state).toEqual({ mark: null, live: null });
    expect(document.querySelectorAll("mark[data-fragment]")).toHaveLength(0);
  });
});
