'use client';

import { cn } from '@/lib/utils';

export interface SegmentedItem<K extends string> {
    key: K;
    label: string;
}

interface SegmentedControlProps<K extends string> {
    items: SegmentedItem<K>[];
    /** `null` = nenhum segmento ativo (ecrã fora das vistas listadas). */
    value: K | null;
    onChange: (key: K) => void;
    /** Rótulo acessível do grupo (ex.: "Secção do grupo"). */
    ariaLabel: string;
    className?: string;
}

/**
 * Segmented control — o ÚNICO padrão para alternar entre 2–3 vistas do mesmo
 * conteúdo (Grupos/Amigos, Despesas/Viagens). Pílula baixa (36px) sem ícones;
 * o segmento ativo é uma "pastilha" branca com o texto em tinta, não em azul —
 * o azul fica reservado ao que é ação. Para escolher um modo entre 4+ opções
 * usa-se o separador sublinhado; para navegação global, a barra inferior
 * (ver Manifesto, Fase 15).
 */
export function SegmentedControl<K extends string>({
    items,
    value,
    onChange,
    ariaLabel,
    className,
}: SegmentedControlProps<K>) {
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={cn('flex h-9 p-1 bg-surface-sunken rounded-full', className)}
        >
            {items.map((item) => {
                const active = item.key === value;
                return (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => !active && onChange(item.key)}
                        className={cn(
                            'flex-1 rounded-full text-sm font-semibold transition-colors',
                            active ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
