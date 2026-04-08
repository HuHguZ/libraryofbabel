"use client";

import dynamic from "next/dynamic";

const FloatingParticles = dynamic(
  () => import("@/components/FloatingParticles"),
  { ssr: false }
);
const NavigationProgress = dynamic(
  () => import("@/components/NavigationProgress"),
  { ssr: false }
);
const DecorativeHexagons = dynamic(
  () => import("@/components/DecorativeHexagons"),
  { ssr: false }
);

export default function ClientOverlays() {
  return (
    <>
      <NavigationProgress />
      <FloatingParticles count={10} />
      <DecorativeHexagons />
    </>
  );
}
