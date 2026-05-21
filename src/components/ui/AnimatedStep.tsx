'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { slideStepVariants, stepTransition, fadeVariants, fadeUpTransition } from '@/lib/motion';

interface AnimatedStepProps {
  stepKey: string;
  direction?: number;
  children: React.ReactNode;
  className?: string;
  /** Slide horizontal (wizard) vs fade only */
  variant?: 'slide' | 'fade';
}

export function AnimatedStep({
  stepKey,
  direction = 1,
  children,
  className,
  variant = 'slide',
}: AnimatedStepProps) {
  const reduceMotion = useReducedMotion();
  const variants = variant === 'slide' && !reduceMotion ? slideStepVariants : fadeVariants;
  const transition = reduceMotion ? { duration: 0.01 } : stepTransition;

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={transition}
        style={{ overflow: 'visible' }}
        className={cn('overflow-visible', className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function AnimatedFade({
  showKey,
  children,
  className,
}: {
  showKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={showKey}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
        transition={reduceMotion ? { duration: 0.01 } : fadeUpTransition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
