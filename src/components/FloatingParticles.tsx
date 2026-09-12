"use client";

import { motion } from "motion/react";
import { useState } from "react";

interface Particle {
  id: number;
  left: string;
  size: number;
  delay: number;
  duration: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 3,
    delay: Math.random() * 5,
    duration: 4 + Math.random() * 6,
  }));
}

/** Rendered client-side only (see ClientOverlays), so the random layout never has to match server markup. */
export default function FloatingParticles({ count = 12 }: { count?: number }) {
  const [particles] = useState<Particle[]>(() => makeParticles(count));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          style={{
            position: "absolute",
            bottom: "-10px",
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "rgba(201, 168, 76, 0.4)",
            boxShadow: "0 0 6px rgba(201, 168, 76, 0.2)",
          }}
          animate={{
            y: [0, -800],
            opacity: [0, 0.6, 0.4, 0],
          }}
          transition={{
            delay: p.delay,
            duration: p.duration,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}
