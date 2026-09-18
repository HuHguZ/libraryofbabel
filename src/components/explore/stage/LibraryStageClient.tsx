"use client";

import dynamic from "next/dynamic";

// WebGL has nothing to render on the server; a server layout cannot ask for `ssr: false` itself.
const LibraryStage = dynamic(() => import("./LibraryStage"), { ssr: false });

/** The stage of the (library) layout, loaded in the browser only. */
export default function LibraryStageClient() {
  return <LibraryStage />;
}
