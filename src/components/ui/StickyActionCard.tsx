import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { getNotificationCardBottom, getStackAboveMinimizedBottom } from '@/lib/bottomDock';

interface StickyActionCardProps {
    visible: boolean;
    title: string;
    actionLabel: string;
    onAction: () => void;
    icon?: string;
    className?: string;
    /** When a minimized wizard sheet is open, sit above its dock pill */
    stackAboveMinimized?: boolean;
}

export function StickyActionCard({
    visible,
    title,
    actionLabel,
    onAction,
    icon = '🛍️',
    className,
    stackAboveMinimized = false,
}: StickyActionCardProps) {
    if (!visible) return null;

    const bottomStyle = stackAboveMinimized
        ? { bottom: getStackAboveMinimizedBottom(true) }
        : { bottom: getNotificationCardBottom(true) };

    return (
        <div
            className={cn(
                'fixed left-0 right-0 z-[54] px-4 transition duration-300 animate-in slide-in-from-bottom-5 fade-in duration-500',
                'container mx-auto max-w-2xl pointer-events-none',
                className
            )}
            style={bottomStyle}
        >
            <div className="bg-surface/95 backdrop-blur-md border border-primary-200 dark:border-primary-900/50 rounded-2xl shadow-xl shadow-primary-900/10 p-4 flex items-center justify-between gap-4 pointer-events-auto ring-1 ring-black/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xl shrink-0 animate-bounce-subtle">
                        {icon}
                    </div>
                    <div>
                        <p className="font-bold text-ink text-sm leading-tight">{title}</p>
                    </div>
                </div>
                <Button onClick={onAction} size="sm" className="whitespace-nowrap btn-primary shrink-0">
                    {actionLabel}
                </Button>
            </div>
        </div>
    );
}
