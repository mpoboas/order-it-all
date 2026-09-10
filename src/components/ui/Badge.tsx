import React from 'react';
import { cn } from '@/lib/utils';

// Papéis semânticos. Cada cor diz uma coisa: verde = feito, âmbar = à espera,
// vermelho = não deu, azul = informativo/neutro.
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// Estados do domínio → tom. Mantém a API antiga (variant="open" etc.) a funcionar.
const DOMAIN_TO_TONE: Record<string, BadgeTone> = {
    open: 'success',
    found: 'success',
    bought: 'success',
    completed: 'success',
    pending: 'warning',
    in_progress: 'warning',
    closed: 'danger',
    not_available: 'danger',
    missing: 'danger',
    info: 'info',
    neutral: 'neutral',
};

const TONES: Record<BadgeTone, string> = {
    success: 'bg-success-bg text-success-fg',
    warning: 'bg-warning-bg text-warning-fg',
    danger: 'bg-danger-bg text-danger-fg',
    info: 'bg-info-bg text-info-fg',
    neutral: 'bg-surface-sunken text-ink-soft',
};

interface BadgeProps {
    /** Tom semântico, ou um estado do domínio (open/pending/found/…). */
    variant: BadgeTone | keyof typeof DOMAIN_TO_TONE;
    children: React.ReactNode;
    /** Ícone opcional à esquerda. */
    icon?: React.ReactNode;
    className?: string;
}

export function Badge({ variant, children, icon, className }: BadgeProps) {
    const tone: BadgeTone =
        (TONES as Record<string, string>)[variant] !== undefined
            ? (variant as BadgeTone)
            : DOMAIN_TO_TONE[variant] ?? 'neutral';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                TONES[tone],
                className,
            )}
        >
            {icon}
            {children}
        </span>
    );
}
