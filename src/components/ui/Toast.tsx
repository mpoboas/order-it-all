'use client';

import React from 'react';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';

export function ToastContainer() {
    const { toasts, removeToast } = useToast();

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cn(
                        'flex items-center justify-between gap-4 px-5 py-4 rounded-2xl shadow-lg border animate-in slide-in-from-right-5 duration-300 max-w-sm',
                        toast.type === 'success' && 'bg-green-50 text-green-800 border-green-200',
                        toast.type === 'error' && 'bg-red-50 text-red-800 border-red-200',
                        toast.type === 'info' && 'bg-blue-50 text-blue-800 border-blue-200'
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
