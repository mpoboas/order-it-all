'use client';

import React, { useEffect, useState } from 'react';
import { cn, getInitials } from '@/lib/utils';

interface AvatarProps {
    name: string;
    src?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /** Overlap stack (order row): light ring separates circles */
    stacked?: boolean;
    className?: string;
}

export function Avatar({ name, src, size = 'md', stacked = false, className }: AvatarProps) {
    const [imgFailed, setImgFailed] = useState(false);
    const displayName = name?.trim() || '?';
    const initials = getInitials(displayName);
    const imageSrc = src?.trim() || undefined;
    const showImage = Boolean(imageSrc) && !imgFailed;

    useEffect(() => {
        setImgFailed(false);
    }, [imageSrc]);

    const sizes = {
        xs: 'w-5 h-5 text-[10px]',
        sm: 'w-8 h-8 text-sm',
        md: 'w-10 h-10 text-base',
        lg: 'w-16 h-16 text-2xl',
    };

    const ringClass = stacked
        ? 'ring-2 ring-white dark:ring-slate-800'
        : 'ring-1 ring-black/15 dark:ring-white/20';

    const sizeClass = sizes[size];

    if (showImage) {
        return (
            <img
                src={imageSrc}
                alt={displayName}
                onError={() => setImgFailed(true)}
                className={cn(
                    'rounded-full object-cover shrink-0 bg-gray-200',
                    ringClass,
                    'shadow-sm',
                    sizeClass,
                    className
                )}
            />
        );
    }

    return (
        <div
            className={cn(
                'rounded-full flex items-center justify-center font-bold shrink-0',
                'text-white shadow-sm',
                ringClass,
                sizeClass,
                className
            )}
            style={{
                background: `linear-gradient(135deg, var(--primary-600), var(--primary-800))`,
            }}
            title={displayName}
            aria-hidden
        >
            {initials}
        </div>
    );
}
