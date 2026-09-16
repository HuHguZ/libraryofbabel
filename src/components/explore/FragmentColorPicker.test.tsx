import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChakraProvider } from "@chakra-ui/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/ru.json";
import { system } from "@/lib/theme";
import { DEFAULT_FRAGMENT_COLOR } from "@/lib/fragmentColor";
import FragmentColorPicker from "./FragmentColorPicker";

function Picker({ onPick }: { onPick: (color: string) => void }) {
  const [color, setColor] = useState(DEFAULT_FRAGMENT_COLOR);
  return (
    <FragmentColorPicker
      color={color}
      onChange={(next) => {
        setColor(next);
        onPick(next);
      }}
    />
  );
}

function renderPicker() {
  const picked: string[] = [];
  render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <ChakraProvider value={system}>
        <Picker onPick={(c) => picked.push(c)} />
      </ChakraProvider>
    </NextIntlClientProvider>
  );
  return picked;
}

const swatch = (color: string) => document.querySelector<HTMLElement>(`[data-part="swatch-trigger"][title="${color}"]`);
const pickerState = () => document.querySelector('[data-scope="color-picker"][data-part="content"]')?.getAttribute("data-state");

describe("FragmentColorPicker", () => {
  afterEach(cleanup);

  it("opens from the swatch and applies a ready-made colour", async () => {
    const picked = renderPicker();
    expect(pickerState()).not.toBe("open");

    await act(async () => {
      fireEvent.click(screen.getByLabelText(messages.Reader.fragmentColor));
    });
    expect(pickerState()).toBe("open");
    const blue = swatch("#3a6fc4");
    expect(blue).not.toBeNull();

    await act(async () => {
      fireEvent.click(blue!);
    });
    expect(picked.at(-1)).toBe("#3a6fc4");
  });

  it("goes back to the default colour", async () => {
    const picked = renderPicker();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(messages.Reader.fragmentColor));
    });
    await act(async () => {
      fireEvent.click(swatch("#4f9a5a")!);
    });
    const reset = screen.getByText(messages.Reader.fragmentColorReset);
    await act(async () => {
      fireEvent.click(reset);
    });
    expect(picked).toEqual(["#4f9a5a", DEFAULT_FRAGMENT_COLOR]);
  });
});
