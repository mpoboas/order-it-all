import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export function Sheet({ isOpen, onClose, title, children, footer }: SheetProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsMounted(true);
            // Small delay to ensure mount happens before animation start
            const timer = setTimeout(() => setIsVisible(true), 10);
            document.body.style.overflow = 'hidden';

            return () => {
                clearTimeout(timer);
                document.body.style.overflow = '';
            };
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => setIsMounted(false), 300); // Match transition duration
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isMounted) return null;

    return (
        <div className={cn("fixed inset-0 z-[100]", !isOpen && "pointer-events-none")}>
            {/* Backdrop */}
            <div
                className={cn(
                    "absolute inset-0 bg-black/50 transition-opacity duration-300 ease-in-out",
                    isVisible ? "opacity-100" : "opacity-0"
                )}
                onClick={onClose}
            />

            {/* Sheet */}
            <div
                className={cn(
                    "absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-2xl transition-transform duration-300 ease-out flex flex-col max-h-[92vh]",
                    isVisible ? "translate-y-0" : "translate-y-full"
                )}
            >
                {/* Drag Handle & Header */}
                <div className="shrink-0 pt-3 pb-2 px-6 border-b border-gray-100">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                        <button
                            onClick={onClose}
                            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-6 safe-scroll">
                    {children}
                </div>

                {/* Footer (Sticky) */}
                {footer && (
                    <div className="shrink-0 p-6 pt-4 border-t border-gray-100 bg-white safe-bottom">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
