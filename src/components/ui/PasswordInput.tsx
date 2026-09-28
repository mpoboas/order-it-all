'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { fieldBase, fieldError } from '@/components/ui/Input';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label: string;
    error?: string;
    /** Texto de ajuda por baixo (ex.: "Mínimo 8 caracteres"), escondido quando há erro. */
    hint?: string;
}

/** Campo de password com o mesmo aspeto do `Input` e um botão para mostrar/
 *  esconder — no telemóvel, sem ver o que se escreve, o "confirmar password"
 *  era a única rede e falhava muito. */
export function PasswordInput({ label, error, hint, className, id, ...props }: PasswordInputProps) {
    const [visible, setVisible] = useState(false);
    const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
    return (
        <div className="space-y-2">
            <label htmlFor={inputId} className="block text-sm font-bold text-ink">
                {label}
            </label>
            <div className="relative">
                <input
                    id={inputId}
                    type={visible ? 'text' : 'password'}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={cn(fieldBase, 'pr-12', error && fieldError, className)}
                    aria-invalid={error ? true : undefined}
                    {...props}
                />
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-faint transition-colors hover:text-ink-soft"
                    aria-label={visible ? 'Esconder password' : 'Mostrar password'}
                    aria-pressed={visible}
                >
                    <Icon name={visible ? 'visibility_off' : 'visibility'} className="text-xl" />
                </button>
            </div>
            {error ? (
                <p className="text-sm text-danger">{error}</p>
            ) : hint ? (
                <p className="text-sm text-ink-faint">{hint}</p>
            ) : null}
        </div>
    );
}
