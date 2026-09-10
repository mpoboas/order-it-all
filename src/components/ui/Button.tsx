import React from 'react';
import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Mostra um spinner por cima do conteúdo, desativa e engole cliques. */
    loading?: boolean;
    /** Ocupa toda a largura disponível. */
    block?: boolean;
    children: React.ReactNode;
}

// Uma cor de ação (primary). Tudo plano — sem gradientes. secondary é a mesma
// cor em tom baixo; warning/danger são estado, não marca.
const VARIANTS: Record<ButtonVariant, string> = {
    primary:
        'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-600 shadow-sm',
    secondary:
        'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-200 dark:hover:bg-primary-900 focus-visible:ring-primary-600',
    danger:
        'bg-danger text-white hover:brightness-110 focus-visible:ring-danger shadow-sm',
    warning:
        'bg-warning-bg text-warning-fg hover:brightness-105 focus-visible:ring-warning-fg',
    ghost:
        'bg-transparent text-ink-soft hover:bg-surface-sunken focus-visible:ring-hairline-strong',
};

const SIZES: Record<ButtonSize, string> = {
    sm: 'h-9 px-4 text-sm gap-1.5',
    md: 'h-11 px-6 text-base gap-2',
    lg: 'h-13 px-8 text-lg gap-2',
};

export function Button({
    variant = 'primary',
    size = 'md',
    className,
    children,
    disabled,
    loading = false,
    block = false,
    onClick,
    type = 'button',
    ...props
}: ButtonProps) {
    const { trigger } = useWebHaptics();
    const isDisabled = disabled || loading;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isDisabled) return;
        trigger();
        onClick?.(e);
    };

    return (
        <button
            type={type}
            className={cn(
                'inline-flex items-center justify-center rounded-full font-semibold',
                'transition duration-200 ease-in-out active:scale-[0.97]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
                VARIANTS[variant],
                SIZES[size],
                block && 'w-full',
                loading && 'btn-loading',
                variant === 'ghost' || variant === 'secondary' || variant === 'warning'
                    ? 'btn-loading--dark'
                    : null,
                className,
            )}
            disabled={isDisabled}
            aria-busy={loading || undefined}
            onClick={handleClick}
            {...props}
        >
            {children}
        </button>
    );
}
