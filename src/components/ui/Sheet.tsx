'use client';

import React, { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { sheetEase, sheetSpring, fadeUpTransition, footerVariants } from '@/lib/motion';
import { AnimatedFade } from '@/components/ui/AnimatedStep';

export type SheetSize = 'auto' | 'medium' | 'large';

interface SheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    onBack?: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** Changes trigger footer enter/exit animation */
    footerKey?: string;
    /** Controls minimum height on mobile; default large for usable scroll + dropdown space */
    size?: SheetSize;
}

const sheetSizeClasses: Record<SheetSize, string> = {
    auto: 'max-h-[min(92dvh,92vh)]',
    medium: 'max-h-[min(92dvh,92vh)] min-h-[min(55dvh,55vh)]',
    large: 'max-h-[min(92dvh,92vh)] min-h-[min(82dvh,82vh)]',
};

export function Sheet({
    isOpen,
    onClose,
    title,
    subtitle,
    onBack,
    children,
    footer,
    footerKey = 'footer',
    size = 'medium',
}: SheetProps) {
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
        document.body.style.overflow = '';
    }, [isOpen]);

    const panelTransition = reduceMotion ? { duration: 0.01 } : sheetSpring;
    const backdropTransition = reduceMotion ? { duration: 0.01 } : sheetEase;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-end sm:p-4">
                    <motion.div
                        className="absolute inset-0 bg-black/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={backdropTransition}
                        onClick={onClose}
                    />

                    <motion.div
                        className={cn(
                            'relative w-full max-w-lg sm:max-w-xl flex flex-col bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[28px] shadow-2xl',
                            sheetSizeClasses[size]
                        )}
                        role="dialog"
                        aria-modal="true"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={panelTransition}
                    >
                        <div className="shrink-0 pt-3 pb-2 px-4 sm:px-6 border-b border-gray-100 dark:border-slate-800">
                            <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
                            <div className="flex justify-between items-center mb-2 gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <AnimatePresence mode="popLayout">
                                        {onBack && (
                                            <motion.button
                                                type="button"
                                                key="back"
                                                onClick={onBack}
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -8 }}
                                                transition={fadeUpTransition}
                                                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0"
                                                aria-label="Voltar"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                    <div className="min-w-0 flex-1">
                                        <AnimatedFade showKey={title}>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
                                        </AnimatedFade>
                                        {subtitle && (
                                            <AnimatedFade showKey={subtitle}>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{subtitle}</p>
                                            </AnimatedFade>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0"
                                    aria-label="Fechar"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-1 flex-col min-h-0 min-w-0">
                            <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
                                {children}
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {footer && (
                                <motion.div
                                    key={footerKey}
                                    className="shrink-0 px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-6 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 safe-bottom"
                                    variants={footerVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={reduceMotion ? { duration: 0.01 } : fadeUpTransition}
                                >
                                    {footer}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
