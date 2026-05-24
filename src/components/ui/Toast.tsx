'use client';

import React from 'react';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';

export function ToastContainer() {
    const { toasts, removeToast } = useToast();

    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top,0px))] z-[110] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4 pointer-events-none"
            aria-live="polite"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cn(
                        'pointer-events-auto flex w-full items-center justify-between gap-4 px-5 py-4 rounded-2xl shadow-lg border animate-in slide-in-from-top-2 duration-300',
                        toast.type === 'success' && 'bg-green-50 text-green-800 border-green-200 dark:bg-green-950/90 dark:text-green-100 dark:border-green-800',
                        toast.type === 'error' && 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/90 dark:text-red-100 dark:border-red-800',
                        toast.type === 'info' && 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/90 dark:text-blue-100 dark:border-blue-800'
                    )}
                >
                    <span className="text-sm font-medium">{toast.message}</span>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}
