'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
}

/** Interruptor (on/off) — o mesmo em toda a app, com `role="switch"` para os
 *  leitores de ecrã. `label` é só para acessibilidade: o texto visível fica na
 *  linha onde o interruptor vive. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                'disabled:opacity-50',
                checked ? 'bg-primary-600' : 'bg-hairline-strong',
            )}
        >
            <span
                className={cn(
                    'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ml-1',
                    checked && 'translate-x-5',
                )}
            />
        </button>
    );
}
