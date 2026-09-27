'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

interface CopyableValueProps {
    /** O que vai para a área de transferência. */
    value: string;
    /** Como se mostra (ex.: número agrupado "912 345 678"). */
    display?: string;
    label?: string;
}

/** Valor com botão "Copiar" ao lado — confirma com "Copiado" durante 2s. Se
 *  a cópia falhar (alguns contextos do iOS), diz para copiar à mão — o valor
 *  aceita o toque longo do iOS (menu "Copiar"), que a app desliga no resto. */
export function CopyableValue({ value, display, label }: CopyableValueProps) {
    const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

    // Sem `async`/`await` antes do `copyText`: no iOS a cópia só é permitida
    // enquanto o toque ainda está "ativo".
    const copy = () => {
        void copyText(value).then((ok) => {
            setStatus(ok ? 'copied' : 'failed');
            if (ok) window.setTimeout(() => setStatus('idle'), 2000);
        });
    };

    const copied = status === 'copied';

    return (
        <div className="rounded-xl bg-surface-sunken px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    {label && <p className="text-xs text-ink-soft">{label}</p>}
                    <p
                        className="text-lg font-semibold tracking-tight text-ink tabular-nums truncate select-all"
                        style={{ WebkitTouchCallout: 'default', WebkitUserSelect: 'all' }}
                    >
                        {display ?? value}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={copy}
                    className={cn(
                        'shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-sm font-semibold transition-colors',
                        copied ? 'bg-success-bg text-success-fg' : 'bg-surface text-ink border border-hairline-strong hover:bg-hairline',
                    )}
                >
                    <Icon name={copied ? 'check' : 'content_copy'} className="text-base" />
                    {copied ? 'Copiado' : 'Copiar'}
                </button>
            </div>
            {status === 'failed' && (
                <p role="status" className="mt-2 text-xs text-warning-fg">
                    Não consegui copiar — mantém o dedo no número para o copiares.
                </p>
            )}
        </div>
    );
}
