'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface CollapseProps {
    open: boolean;
    children: React.ReactNode;
    className?: string;
}

/**
 * Abre/fecha em altura, suave. `motion` mede o conteúdo (`height: auto`) e o
 * `overflow: hidden` corta durante a transição. Respeita "reduzir movimento".
 */
export function Collapse({ open, children, className }: CollapseProps) {
    const reduce = useReducedMotion();
    return (
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    key="collapse"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={
                        reduce
                            ? { duration: 0.01 }
                            : { duration: 0.28, ease: [0.32, 0.72, 0, 1] }
                    }
                    style={{ overflow: 'hidden' }}
                    className={className}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
