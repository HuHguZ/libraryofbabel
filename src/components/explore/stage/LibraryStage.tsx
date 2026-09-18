"use client";

import SceneWrapper from "../SceneWrapper";
import StageScene from "./StageScene";
import { useStageSelector, useStageStore } from "./StageProvider";

/** The one canvas of the Library: it outlives the pages and shows what the current page asks for. */
export default function LibraryStage() {
  const store = useStageStore();
  // The store says whether what is shown is up; a stage building its world puts the veil back by saying it is not.
  const ready = useStageSelector((s) => s.ready);
  return (
    <SceneWrapper
      seed={0}
      veil={!ready}
      // A page that asked for a view has the director build its world, and the director lifts the veil once that is in;
      // without a view (an unknown address) there is nothing to wait for.
      onReady={() => {
        if (!store.getSnapshot().view) store.patch({ ready: true });
      }}
    >
      <StageScene />
    </SceneWrapper>
  );
}
