'use client';

import { useWebHaptics } from 'web-haptics/react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface QuickAction {
    icon: IconName;
    label: string;
    onClick: () => void;
    /** A ação principal do ecrã — círculo cheio na cor de ação. No máximo uma. */
    primary?: boolean;
}

interface QuickActionsProps {
    actions: QuickAction[];
    className?: string;
}

/**
 * Fila de ações rápidas de um ecrã (grupo, amigo) — círculo com ícone e rótulo
 * por baixo, como as ações de um contacto no iOS. Substitui a fila de chips com
 * scroll, que parecia filtros/separadores e punha a ação principal ("Acertar
 * contas") ao mesmo nível de "Totais". Cabe sempre sem scroll (até 4–5 ações).
 */
export function QuickActions({ actions, className }: QuickActionsProps) {
    const { trigger } = useWebHaptics();
    if (actions.length === 0) return null;

    return (
        <div className={cn('flex justify-center', className)}>
            {actions.map((action) => (
                <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                        trigger();
                        action.onClick();
                    }}
                    className="group flex-1 max-w-24 flex flex-col items-center gap-1.5 py-1 focus:outline-none"
                >
                    <span
                        className={cn(
                            'w-12 h-12 rounded-full flex items-center justify-center transition',
                            'group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-primary-600 group-focus-visible:ring-offset-2',
                            action.primary
                                ? 'btn-brand text-white'
                                : 'bg-primary-50 text-primary-700 group-hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-300 dark:group-hover:bg-primary-900',
                        )}
                    >
                        <Icon name={action.icon} className="text-xl" />
                    </span>
                    <span className="text-xs font-medium text-ink-soft whitespace-nowrap">{action.label}</span>
                </button>
            ))}
        </div>
    );
}
