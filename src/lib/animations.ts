import type { Variants, Transition } from "framer-motion";

// === Base transitions ===
export const smooth: Transition = {
  type: "spring",
  damping: 25,
  stiffness: 120,
};

export const gentle: Transition = {
  type: "spring",
  damping: 30,
  stiffness: 80,
};

// === Fade In Up (replaces .animate-fade-in-up) ===
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...smooth, duration: 0.7 },
  },
};

// === Fade In (replaces .animate-fade-in) ===
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

// === Stagger Container ===
export const stagger = (staggerDelay = 0.12): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: staggerDelay, delayChildren: 0.05 },
  },
});

// === Scale Fade (new — for cards/panels) ===
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { ...smooth, duration: 0.5 },
  },
};

// === Book Page Reveal (new — unfold effect) ===
export const bookReveal: Variants = {
  hidden: {
    opacity: 0,
    rotateX: -8,
    y: 30,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    rotateX: 0,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      damping: 20,
      stiffness: 60,
      duration: 0.9,
    },
  },
};

// === Slide In from left ===
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { ...smooth, duration: 0.5 },
  },
};

// === Ornament expand (new) ===
export const ornamentLine: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

export const ornamentDiamond: Variants = {
  hidden: { scale: 0, rotate: 0, opacity: 0 },
  visible: {
    scale: 1,
    rotate: 45,
    opacity: 1,
    transition: { delay: 0.3, duration: 0.5, ease: "easeOut" },
  },
};

// === Glow pulse (new — subtle breathing) ===
export const glowPulse: Variants = {
  initial: { opacity: 0.4 },
  animate: {
    opacity: [0.4, 0.8, 0.4],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
};

// === Number counter (new — for stats) ===
export const counterPop: Variants = {
  hidden: { opacity: 0, scale: 0.5, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 12,
      stiffness: 200,
    },
  },
};

// === Floating particle (new) ===
export const floatingParticle = (delay: number, duration: number): Variants => ({
  initial: {
    opacity: 0,
    y: 0,
  },
  animate: {
    opacity: [0, 0.6, 0],
    y: [-20, -80],
    transition: {
      delay,
      duration,
      repeat: Infinity,
      ease: "easeOut",
    },
  },
});

// === Hover lift (for interactive elements) ===
export const hoverLift = {
  whileHover: { y: -2, transition: { duration: 0.2 } },
  whileTap: { scale: 0.98 },
};

// === Page transition ===
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.25, ease: "easeIn" },
  },
};

// === Shimmer text (new — golden shimmer) ===
export const shimmer: Variants = {
  hidden: { backgroundPosition: "-200% center" },
  visible: {
    backgroundPosition: "200% center",
    transition: { duration: 3, repeat: Infinity, ease: "linear" },
  },
};

// === Letter by letter reveal (new) ===
export const letterReveal: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
};

export const letter: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// === Scroll-triggered fade in up ===
export const scrollFadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

// === Scroll-triggered scale reveal ===
export const scrollScaleReveal: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

// === Infinite slow rotate ===
export const slowRotate: Variants = {
  animate: {
    rotate: 360,
    transition: { duration: 120, repeat: Infinity, ease: "linear" },
  },
};

// === Draw SVG path ===
export const drawPath: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 2, ease: [0.22, 1, 0.36, 1] },
  },
};

// === Typewriter cursor blink ===
export const cursorBlink: Variants = {
  animate: {
    opacity: [1, 0, 1],
    transition: { duration: 1.2, repeat: Infinity, ease: "linear" },
  },
};
