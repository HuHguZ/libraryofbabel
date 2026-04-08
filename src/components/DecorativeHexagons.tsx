"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

/* ─── Single hexagon path helper ─── */
function hexPath(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ") + "Z";
}

/* ─── Config for each decorative hex cluster ─── */
interface HexDef {
  top: string;
  side: "left" | "right";
  sideValue: string;
  size: number;
  rings: number;
  opacity: number;
  speed: number;
  rotate?: [number, number];
}

const hexagons: HexDef[] = [
  // Hero — large left
  {
    top: "5%",
    side: "left",
    sideValue: "2%",
    size: 100,
    rings: 3,
    opacity: 0.14,
    speed: -120,
    rotate: [0, 15],
  },
  // Hero — medium right
  {
    top: "12%",
    side: "right",
    sideValue: "4%",
    size: 60,
    rings: 2,
    opacity: 0.1,
    speed: -180,
    rotate: [-5, 10],
  },
  // Between search & quotes — right
  {
    top: "30%",
    side: "right",
    sideValue: "1%",
    size: 80,
    rings: 3,
    opacity: 0.1,
    speed: -90,
    rotate: [0, -12],
  },
  // Structure section — left, large
  {
    top: "42%",
    side: "left",
    sideValue: "0%",
    size: 120,
    rings: 3,
    opacity: 0.08,
    speed: -150,
    rotate: [5, -8],
  },
  // Numbers section — right, small
  {
    top: "55%",
    side: "right",
    sideValue: "3%",
    size: 45,
    rings: 2,
    opacity: 0.13,
    speed: -200,
    rotate: [0, 20],
  },
  // Left accent
  {
    top: "62%",
    side: "left",
    sideValue: "4%",
    size: 55,
    rings: 1,
    opacity: 0.1,
    speed: -70,
  },
  // Explore section — right, large
  {
    top: "72%",
    side: "right",
    sideValue: "0%",
    size: 90,
    rings: 3,
    opacity: 0.09,
    speed: -130,
    rotate: [-3, 10],
  },
  // How it works — left
  {
    top: "82%",
    side: "left",
    sideValue: "2%",
    size: 70,
    rings: 2,
    opacity: 0.11,
    speed: -100,
    rotate: [0, -15],
  },
  // Final — right small
  {
    top: "92%",
    side: "right",
    sideValue: "6%",
    size: 40,
    rings: 2,
    opacity: 0.12,
    speed: -160,
    rotate: [5, -5],
  },
];

function ParallaxHex({ def }: { def: HexDef }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();

  const y = useTransform(scrollYProgress, [0, 1], [0, def.speed]);
  const rotate = def.rotate
    ? useTransform(scrollYProgress, [0, 1], def.rotate)
    : undefined;

  const cx = def.size + 4;
  const cy = def.size + 4;
  const viewBox = `0 0 ${(def.size + 4) * 2} ${(def.size + 4) * 2}`;

  const ringSteps = Array.from({ length: def.rings }, (_, i) => {
    const ratio = 1 - i * 0.3;
    return def.size * ratio;
  });

  return (
    <motion.div
      ref={ref}
      style={{
        position: "absolute",
        top: def.top,
        [def.side]: def.sideValue,
        pointerEvents: "none",
        y,
        rotate,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: def.opacity }}
      transition={{ duration: 2.5, delay: 0.3 }}
    >
      <svg
        width={def.size * 2 + 8}
        height={def.size * 2 + 8}
        viewBox={viewBox}
      >
        {ringSteps.map((r, i) => (
          <path
            key={i}
            d={hexPath(cx, cy, r)}
            fill="none"
            stroke="rgba(201, 168, 76, 1)"
            strokeWidth={i === 0 ? 1 : 0.5}
            opacity={1 - i * 0.3}
          />
        ))}
        {/* Connecting lines from center to vertices */}
        {def.rings >= 2 && Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const innerR = ringSteps[ringSteps.length - 1] * 0.5;
          const outerR = ringSteps[0];
          return (
            <line
              key={`line-${i}`}
              x1={cx + innerR * Math.cos(angle)}
              y1={cy + innerR * Math.sin(angle)}
              x2={cx + outerR * Math.cos(angle)}
              y2={cy + outerR * Math.sin(angle)}
              stroke="rgba(201, 168, 76, 1)"
              strokeWidth="0.3"
              opacity="0.4"
            />
          );
        })}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill="rgba(201, 168, 76, 0.5)" />
      </svg>
    </motion.div>
  );
}

export default function DecorativeHexagons() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        overflow: "hidden",
      }}
    >
      {hexagons.map((def, i) => (
        <ParallaxHex key={i} def={def} />
      ))}
    </div>
  );
}
