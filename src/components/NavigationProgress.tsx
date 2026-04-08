"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const prevPathname = useRef(pathname);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      // Navigation completed — hide the bar
      setIsNavigating(false);
      prevPathname.current = pathname;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [pathname]);

  useEffect(() => {
    // Intercept link clicks to detect navigation start
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (
        anchor &&
        anchor.href &&
        anchor.href.startsWith(window.location.origin) &&
        !anchor.href.includes("#") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        const url = new URL(anchor.href);
        if (url.pathname !== pathname) {
          setIsNavigating(true);
          // Safety timeout — hide after 8s if navigation somehow stalls
          timeoutRef.current = setTimeout(() => setIsNavigating(false), 8000);
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  return (
    <AnimatePresence>
      {isNavigating && (
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{
            scaleX: [0, 0.4, 0.7, 0.85],
            opacity: 1,
          }}
          exit={{
            scaleX: 1,
            opacity: 0,
            transition: { duration: 0.3, ease: "easeOut" },
          }}
          transition={{
            scaleX: {
              duration: 4,
              ease: [0.1, 0.5, 0.2, 1],
            },
            opacity: { duration: 0.2 },
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, #c9a84c 20%, #dcc48a 50%, #c9a84c 80%, transparent)",
            transformOrigin: "left",
            zIndex: 9999,
            boxShadow: "0 0 8px rgba(201, 168, 76, 0.4), 0 0 2px rgba(201, 168, 76, 0.6)",
          }}
        />
      )}
    </AnimatePresence>
  );
}
