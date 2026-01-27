import React from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'open' | 'closed' | 'pending' | 'found' | 'not_available' | 'info';

interface BadgeProps {
    variant: BadgeVariant;
    children: React.ReactNode;
    className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
    const variants: Record<BadgeVariant, string> = {
        open: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
        closed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
        pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
        found: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
        not_available: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
        info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
                variants[variant],
                className
            )}
        >
            {children}
        </span>
    );
}
