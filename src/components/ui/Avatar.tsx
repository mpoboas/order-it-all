import React from 'react';
import { cn, getInitials, stringToColor } from '@/lib/utils';

interface AvatarProps {
    name: string;
    src?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
    const initials = getInitials(name);
    const bgColor = stringToColor(name);

    const sizes = {
        xs: 'w-5 h-5 text-[10px]',
        sm: 'w-8 h-8 text-sm',
        md: 'w-10 h-10 text-base',
        lg: 'w-16 h-16 text-2xl',
    };

    if (src) {
        return (
            <img
                src={src}
                alt={name}
                className={cn(
                    'rounded-full object-cover bg-gray-200',
                    sizes[size],
                    className
                )}
            />
        );
    }

    return (
        <div
            className={cn(
                'rounded-full flex items-center justify-center text-white font-bold',
                sizes[size],
                className
            )}
            style={{ background: `linear-gradient(135deg, ${bgColor}, ${bgColor}dd)` }}
        >
            {initials}
        </div>
    );
}
