'use client';

import React from 'react';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

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
                        toast.type === 'success' && 'bg-success-bg text-success-fg border-success-fg/25',
                        toast.type === 'error' && 'bg-danger-bg text-danger-fg border-danger-fg/25',
                        toast.type === 'info' && 'bg-info-bg text-info-fg border-info-fg/25'
                    )}
                >
                    <span className="text-sm font-medium">{toast.message}</span>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="text-ink-faint hover:text-ink-soft transition-colors"
                    >
                        <Icon name="close" className="text-base" />
                    </button>
                </div>
            ))}
        </div>
    );
}
