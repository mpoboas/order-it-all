import type { Transition, Variants } from 'motion/react';

export const sheetSpring = {
  type: 'spring',
  damping: 32,
  stiffness: 380,
  mass: 0.85,
} satisfies Transition;

export const sheetEase = {
  duration: 0.32,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
} satisfies Transition;

export const stepTransition: Transition = {
  duration: 0.32,
  ease: [0.32, 0.72, 0, 1],
};

export const fadeUpTransition: Transition = {
  duration: 0.28,
  ease: [0.32, 0.72, 0, 1],
};

export const slideStepVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '12%' : '-12%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-10%' : '10%',
    opacity: 0,
  }),
};

export const fadeVariants: Variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export const footerVariants: Variants = {
  enter: { opacity: 0, y: 16 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
};

export const staggerContainerVariants: Variants = {
  enter: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
  center: {
    transition: { staggerChildren: 0.05 },
  },
};

export const staggerItemVariants: Variants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
};
