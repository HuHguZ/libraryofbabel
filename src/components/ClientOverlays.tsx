"use client";

import dynamic from "next/dynamic";
import { usePathname } from "@/i18n/navigation";

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
  const pathname = usePathname();
  const immersive = (pathname?.startsWith("/explore") || pathname?.startsWith("/page/")) ?? false;
  return (
    <>
      <NavigationProgress />
      {!immersive && <FloatingParticles count={10} />}
      {!immersive && <DecorativeHexagons />}
    </>
  );
}
