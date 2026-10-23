import { ExploreStage } from "@/components/explore/ExploreHud";
import LibraryStageClient from "@/components/explore/stage/LibraryStageClient";
import { StageProvider } from "@/components/explore/stage/StageProvider";
import { OnlineProvider } from "@/components/online/OnlineProvider";
import OnlineHud from "@/components/online/OnlineHud";
import MapLayer from "@/components/online/MapLayer";
import ChatPanel from "@/components/online/ChatPanel";

/**
 * The walk, the shelf, the volume and the reader share one stage. A layout persists across navigations between its
 * routes, so the canvas and what it shows stay while the pages (their HUDs) change above it.
 */
export default function LibraryLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <StageProvider>
      <OnlineProvider>
        <ExploreStage>
          <LibraryStageClient />
          {children}
          <OnlineHud />
          <MapLayer />
          <ChatPanel />
        </ExploreStage>
      </OnlineProvider>
    </StageProvider>
  );
}
