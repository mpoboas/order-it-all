'use client';

import React, { useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { sheetEase, sheetSpring, fadeUpTransition, footerVariants } from '@/lib/motion';
import { AnimatedFade } from '@/components/ui/AnimatedStep';
import { getMinimizedSheetBottom } from '@/lib/bottomDock';
import { confirmDiscard, UNSAVED_DRAFT_MESSAGE } from '@/lib/confirmDiscard';

export type SheetSize = 'auto' | 'medium' | 'large';

interface SheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    onBack?: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    footerKey?: string;
    size?: SheetSize;
    /** Wizard drafts: minimize instead of closing on X / backdrop */
    minimizable?: boolean;
    minimized?: boolean;
    onMinimize?: () => void;
    onExpand?: () => void;
    onDiscard?: () => void;
    minimizedSummary?: React.ReactNode;
    discardConfirmMessage?: string;
    /** Minimized pill sits above bottom nav (admin) or safe area only (member) */
    minimizedAboveBottomNav?: boolean;
}

const sheetSizeClasses: Record<SheetSize, string> = {
    auto: 'max-h-[min(92dvh,92vh)]',
    medium: 'max-h-[min(92dvh,92vh)] min-h-[min(55dvh,55vh)]',
    large: 'max-h-[min(92dvh,92vh)] min-h-[min(82dvh,82vh)]',
};

const DEFAULT_DISCARD_MESSAGE = UNSAVED_DRAFT_MESSAGE;

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
    minimizable = false,
    minimized = false,
    onMinimize,
    onExpand,
    onDiscard,
    minimizedSummary,
    discardConfirmMessage = DEFAULT_DISCARD_MESSAGE,
    minimizedAboveBottomNav = true,
}: SheetProps) {
    const reduceMotion = useReducedMotion();
    const isExpanded = isOpen && (!minimizable || !minimized);

    const handleMinimize = useCallback(() => {
        onMinimize?.();
    }, [onMinimize]);

    const handleDiscard = useCallback(() => {
        if (!onDiscard) {
            onClose();
            return;
        }
        if (confirmDiscard(discardConfirmMessage)) {
            onDiscard();
        }
    }, [onDiscard, onClose, discardConfirmMessage]);

    useEffect(() => {
        if (isExpanded) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
        document.body.style.overflow = '';
    }, [isExpanded]);

    useEffect(() => {
        if (!isOpen || !minimizable || minimized) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleMinimize();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, minimizable, minimized, handleMinimize]);

    const panelTransition = reduceMotion ? { duration: 0.01 } : sheetSpring;
    const backdropTransition = reduceMotion ? { duration: 0.01 } : sheetEase;

    const headerDismiss = minimizable ? handleMinimize : onClose;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {isExpanded && (
                        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-end sm:p-4 pointer-events-none">
                            <motion.div
                                className="absolute inset-0 bg-black/50 pointer-events-auto"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={backdropTransition}
                                onClick={minimizable ? handleMinimize : onClose}
                            />

                            <motion.div
                                className={cn(
                                    'relative w-full max-w-lg sm:max-w-xl flex flex-col bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[28px] shadow-2xl pointer-events-auto',
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
                                            onClick={headerDismiss}
                                            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0"
                                            aria-label={minimizable ? 'Minimizar' : 'Fechar'}
                                        >
                                            {minimizable ? (
                                                <span className="material-icons text-2xl">keyboard_arrow_down</span>
                                            ) : (
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            )}
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

                    {minimizable && minimized && (
                        <motion.div
                            className="fixed inset-x-0 z-[52] flex justify-center px-4 pointer-events-none max-w-2xl mx-auto left-0 right-0"
                            style={{ bottom: getMinimizedSheetBottom(minimizedAboveBottomNav) }}
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={panelTransition}
                        >
                            <div
                                role="region"
                                aria-label={title}
                                aria-expanded={false}
                                className="pointer-events-auto w-full max-w-lg sm:max-w-xl flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700"
                            >
                                <button
                                    type="button"
                                    onClick={onExpand}
                                    className="flex-1 min-w-0 text-left"
                                >
                                    <p className="font-bold text-gray-900 dark:text-gray-100 truncate text-sm">{title}</p>
                                    {minimizedSummary && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {minimizedSummary}
                                        </div>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={onExpand}
                                    className="shrink-0 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition-colors"
                                >
                                    Continuar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDiscard}
                                    className="shrink-0 p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                    aria-label="Descartar"
                                >
                                    <span className="material-icons text-xl">delete_outline</span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </>
            )}
        </AnimatePresence>
    );
}
