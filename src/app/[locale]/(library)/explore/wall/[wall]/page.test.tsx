import { useLayoutEffect, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StageProvider, useStageStore } from "@/components/explore/stage/StageProvider";
import type { StageStore } from "@/components/explore/stage/stageStore";
import { addressOf, cellOf, CENTRE, formatCoordinate, offsetCell } from "@/lib/world";
import type { WorldPlace } from "@/components/explore/HexGalleryScene";
import WallExplorePage from "./page";

const navigation = vi.hoisted(() => ({ hex: "babel", push: vi.fn(), replace: vi.fn() }));
const router = { push: navigation.push, replace: navigation.replace };
const localize = (path: string) => path;
vi.mock("next/navigation", () => ({
  useParams: () => ({ wall: "1" }),
  useSearchParams: () => new URLSearchParams({ hex: navigation.hex }),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router, useLocalizedPath: () => localize }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { x?: string; floor?: string }) =>
    key === "kickerCell" ? `Gallery ${values?.x} · floor ${values?.floor}` : key,
}));
vi.mock("@chakra-ui/react", () => ({ Box: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/online/OnlineProvider", () => ({ useOnlineStore: () => null, useOnlineSelector: () => false }));
vi.mock("@/components/online/GalleryNotes", () => ({ default: () => null }));
vi.mock("@/components/online/NoteComposer", () => ({ default: () => null }));
vi.mock("@/components/explore/cursor", () => ({ mouseCaptureAvailable: () => false }));
vi.mock("@/components/explore/ExploreHud", () => ({
  default: ({ kicker, children }: { kicker: string; children: ReactNode }) => <div><p>{kicker}</p>{children}</div>,
  HudLayer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HudSelector: () => null,
  HudButton: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
}));

afterEach(() => { vi.clearAllMocks(); navigation.hex = "babel"; });

it("uses a rebuilt world's place for the HUD, URL and navigation without remounting the walk page", () => {
  let store!: StageStore;
  function Capture() {
    const current = useStageStore();
    useLayoutEffect(() => { store = current; }, [current]);
    return null;
  }
  const app = () => <StageProvider><Capture /><WallExplorePage /></StageProvider>;
  const { rerender, unmount } = render(app());
  const originalStore = store;
  act(() => store.patch({ place: { level: 0, col: 0, hex: "babel", cell: cellOf("babel") } }));
  const firstHandlers = store.handlers.current;

  fireEvent.click(screen.getByRole("button", { name: "toCentre" }));
  const centreHex = addressOf(CENTRE);
  expect(navigation.push).toHaveBeenLastCalledWith(`/explore/wall/1?hex=${centreHex}`);
  navigation.hex = centreHex;
  rerender(app());
  // Director publishes the new anchor, then its first frame can report facing before React renders again.
  act(() => {
    store.patch({ place: { level: 0, col: 0, hex: centreHex, cell: CENTRE } });
    firstHandlers.onFacingSide?.(0);
    firstHandlers.onClickShelf?.(1, 2);
    firstHandlers.onClickBook?.({ wall: 1, shelf: 2, volume: 3 });
  });
  expect(store).toBe(originalStore);
  expect(store.handlers.current.onFacingSide).toBe(firstHandlers.onFacingSide);
  expect(store.handlers.current.onClickShelf).toBe(firstHandlers.onClickShelf);
  expect(store.handlers.current.onClickBook).toBe(firstHandlers.onClickBook);
  expect(screen.getByText("Gallery 0 · floor 0")).toBeTruthy();
  expect(new URL(window.location.href).searchParams.get("hex")).toBe(centreHex);
  expect(navigation.push).toHaveBeenNthCalledWith(2, `/explore/wall/1/shelf/2?hex=${centreHex}`);
  expect(navigation.push).toHaveBeenNthCalledWith(3, `/explore/wall/1/shelf/2/volume/3?hex=${centreHex}`);

  // Crossing the next doorway also works before a page render, keeping the same world and callbacks.
  const walked: WorldPlace = { level: 0, col: 1, hex: addressOf(offsetCell(CENTRE, 1, 0)), cell: offsetCell(CENTRE, 1, 0) };
  act(() => {
    store.patch({ place: walked });
    store.handlers.current.onPlace?.(walked);
    firstHandlers.onClickShelf?.(1, 3);
  });
  expect(screen.getByText(`Gallery ${formatCoordinate(walked.cell.x)} · floor 0`)).toBeTruthy();
  expect(new URL(window.location.href).searchParams.get("hex")).toBe(walked.hex);
  expect(navigation.push).toHaveBeenLastCalledWith(`/explore/wall/1/shelf/3?hex=${walked.hex}`);
  unmount();
});
