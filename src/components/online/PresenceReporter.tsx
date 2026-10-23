"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Pose } from "@/lib/online/protocol";
import { useStageStore } from "@/components/explore/stage/StageProvider";
import { useOnlineStore } from "./OnlineProvider";
import { poseChanged, presenceOf, viewOf } from "./presence";

/** Tells the online Library where the visitor is, at most ten times a second and only when it changed. */
export default function PresenceReporter() {
  const stage = useStageStore();
  const online = useOnlineStore();
  const sent = useRef<Pose | null>(null);
  const at = useRef(0);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (now - at.current < 0.1) return;
    at.current = now;
    if (online.getSnapshot().status !== "online") {
      sent.current = null;
      return;
    }
    const { place, view, desk } = stage.getSnapshot();
    const pose = stage.commands.visitorPose?.();
    if (!place || !view || !pose) return;
    const next = presenceOf(place, pose.position, pose.yaw, viewOf(view, pose.yaw, desk?.spread ?? 0));
    if (sent.current && !poseChanged(sent.current, next)) return;
    sent.current = next;
    online.send({ type: "pose", ...next });
  });
  return null;
}
