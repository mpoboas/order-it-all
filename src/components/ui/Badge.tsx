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
        open: 'bg-emerald-100 text-emerald-700',
        closed: 'bg-red-100 text-red-700',
        pending: 'bg-amber-100 text-amber-700',
        found: 'bg-emerald-100 text-emerald-700',
        not_available: 'bg-red-100 text-red-700',
        info: 'bg-blue-100 text-blue-700',
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
