'use client';

import React, { useEffect, useState } from 'react';
import { cn, getInitials } from '@/lib/utils';
import { coverGradientFor } from '@/lib/coverColor';

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
        ? 'ring-2 ring-surface'
        : 'ring-1 ring-black/15 dark:ring-white/20';

    const sizeClass = sizes[size];

    const shellClass = cn(
        'rounded-full shrink-0 shadow-sm overflow-hidden',
        ringClass,
        sizeClass,
        className
    );

    if (showImage) {
        return (
            <span className={cn(shellClass, 'inline-block bg-hairline-strong')}>
                <img
                    src={imageSrc}
                    alt={displayName}
                    loading="lazy"
                    decoding="async"
                    onError={() => setImgFailed(true)}
                    className="h-full w-full object-cover"
                />
            </span>
        );
    }

    return (
        <span
            className={cn(
                shellClass,
                'inline-flex items-center justify-center font-bold text-white'
            )}
            // Cor própria por pessoa (a mesma paleta das capas de grupo/amigo,
            // estável por nome) — uma lista de membros deixa de ser um muro
            // de círculos azuis iguais e cada um tem "a sua" cor.
            style={{ background: coverGradientFor(displayName) }}
            title={displayName}
            aria-hidden
        >
            {initials}
        </span>
    );
}
