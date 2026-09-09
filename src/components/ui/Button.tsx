import React from 'react';
import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    className,
    children,
    disabled,
    onClick,
    ...props
}: ButtonProps) {
    const { trigger } = useWebHaptics();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!disabled) trigger();
        onClick?.(e);
    };
    const baseStyles = `
    inline-flex items-center justify-center font-semibold
    transition duration-200 ease-in-out
    disabled:opacity-50 disabled:cursor-not-allowed
    focus:outline-none focus:ring-2 focus:ring-offset-2
  `;

    const variants = {
        primary: `
      bg-gradient-to-r from-emerald-500 to-emerald-600
      text-white rounded-full shadow-lg
      hover:from-emerald-600 hover:to-emerald-700
      hover:shadow-xl hover:-translate-y-0.5
      focus:ring-emerald-500
    `,
        secondary: `
      bg-gradient-to-r from-indigo-500 to-indigo-600
      text-white rounded-full shadow-lg
      hover:from-indigo-600 hover:to-indigo-700
      hover:shadow-xl hover:-translate-y-0.5
      focus:ring-indigo-500
    `,
        danger: `
      bg-gradient-to-r from-red-500 to-red-600
      text-white rounded-full shadow-lg
      hover:from-red-600 hover:to-red-700
      hover:shadow-xl hover:-translate-y-0.5
      focus:ring-red-500
    `,
        warning: `
      bg-gradient-to-r from-amber-500 to-amber-600
      text-white rounded-full shadow-lg
      hover:from-amber-600 hover:to-amber-700
      hover:shadow-xl hover:-translate-y-0.5
      focus:ring-amber-500
    `,
        ghost: `
      bg-transparent text-gray-600
      hover:bg-gray-100 rounded-xl
      focus:ring-gray-500
    `,
    };

    const sizes = {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3 text-base',
        lg: 'px-8 py-4 text-lg',
    };

    return (
        <button
            className={cn(baseStyles, variants[variant], sizes[size], className)}
            disabled={disabled}
            onClick={handleClick}
            {...props}
        >
            {children}
        </button>
    );
}
