'use client';

import { motion } from 'motion/react';
import React from 'react';

/**
 * A simpler page transition component that just handles content fade-in.
 * Use this to wrap the MAIN content of a page, not the whole page structure (like headers).
 * This prevents the "flashing" or layout shifts of spinners.
 */
export default function PageContent({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1] // Custom ease for smoothness
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// Fade in for list items (staggered)
export const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

export const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};
