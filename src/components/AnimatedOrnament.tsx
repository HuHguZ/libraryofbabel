"use client";

import { motion } from "framer-motion";
import { ornamentLine, ornamentDiamond } from "@/lib/animations";

export default function AnimatedOrnament() {
  return (
    <motion.div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
      initial="hidden"
      animate="visible"
    >
      <motion.span
        variants={ornamentLine}
        style={{
          width: 40,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.5), transparent)",
          transformOrigin: "right center",
        }}
      />
      <motion.span
        variants={ornamentDiamond}
        style={{
          width: 6,
          height: 6,
          background: "rgba(201, 168, 76, 0.6)",
          flexShrink: 0,
        }}
      />
      <motion.span
        variants={ornamentLine}
        style={{
          width: 40,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.5), transparent)",
          transformOrigin: "left center",
        }}
      />
    </motion.div>
  );
}
