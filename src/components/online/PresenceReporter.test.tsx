import { cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStageStore } from "@/components/explore/stage/stageStore";
import type { ClientMessage, Reading } from "@/lib/online/protocol";
import { createOnlineStore } from "./onlineStore";
import PresenceReporter from "./PresenceReporter";

let stage = createStageStore(), online = createOnlineStore();
let frame: (state: { clock: { elapsedTime: number } }) => void;
let sent: ClientMessage[];
const book = { hex: "x", wall: 1, shelf: 2, volume: 3 };
const mark = { page: 4, start: 2, end: 8 };
vi.mock("@react-three/fiber", () => ({ useFrame: (callback: typeof frame) => { frame = callback; } }));
vi.mock("@/components/explore/stage/StageProvider", () => ({ useStageStore: () => stage }));
vi.mock("./OnlineProvider", () => ({ useOnlineStore: () => online }));

beforeEach(() => {
  stage = createStageStore(); online = createOnlineStore(); sent = [];
  online.receive({ type: "welcome", you: { id: "me", nick: "Reader", color: "#abcdef" }, last: null, admin: false });
  online.send = message => sent.push(message);
  stage.patch({ place: { col: 0, level: 0, hex: "x", cell: { x: 0n, floor: 0n } } });
  stage.setView({ kind: "desk", book, mode: "read" });
  stage.setDesk({ title: "Book", spread: 2, contents: {}, query: "", loupe: true, mark, markColor: "#112233" });
  stage.commands.visitorPose = () => ({ position: new THREE.Vector3(0, 1.6, 0), yaw: 0, pitch: 0 });
});
afterEach(cleanup);
const tick = (elapsedTime: number) => frame({ clock: { elapsedTime } });

it("publishes a new exact lens crop when only the owner's camera changes", () => {
  let loupe: NonNullable<Reading["loupe"]> = { page: 4, u: 0.2, v: 0.3, power: 3, sample: [0.1, 0, 0, 0, 0.1, 0, 0.2, 0.3, 1] };
  stage.commands.loupePose = () => loupe;
  render(<PresenceReporter />); tick(1);
  expect(sent[0]).toMatchObject({ reading: { loupe } });
  loupe = { ...loupe, sample: [0.2, 0, 0, 0, 0.2, 0, 0.2, 0.3, 1] }; tick(1.2);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ reading: { loupe } });
});

it("shares live selection and loupe changes at the existing ten-Hz limit and explicitly clears them", () => {
  let loupe = { page: 4, u: 0.2, v: 0.3, power: 3 };
  stage.commands.loupePose = () => loupe;
  render(<PresenceReporter />);
  tick(1);
  expect(sent).toMatchObject([{ type: "pose", reading: { fragment: { ...mark, color: "#112233" }, loupe } }]);
  loupe = { ...loupe, u: 0.4 };
  tick(1.05); expect(sent).toHaveLength(1);
  tick(1.11); expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ reading: { loupe: { u: 0.4 } } });
  tick(1.22); expect(sent).toHaveLength(2);
  stage.setDesk({ ...stage.getSnapshot().desk!, mark: null });
  stage.commands.loupePose = () => null;
  tick(1.33);
  expect(sent).toHaveLength(3);
  expect(sent[2]).not.toHaveProperty("reading");
});

it("omits stale reading metadata in the index and clears it when returning there", () => {
  stage.commands.loupePose = () => ({ page: 4, u: 0.2, v: 0.3, power: 3 });
  stage.setView({ kind: "desk", book, mode: "index" });
  render(<PresenceReporter />);
  tick(1);
  expect(sent[0]).not.toHaveProperty("reading");
  stage.setView({ kind: "desk", book, mode: "read" }); tick(1.2);
  expect(sent[1]).toHaveProperty("reading");
  stage.setView({ kind: "desk", book, mode: "index" }); tick(1.4);
  expect(sent[2]).not.toHaveProperty("reading");
});
