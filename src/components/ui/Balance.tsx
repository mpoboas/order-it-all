import { fromCents } from '@/lib/ledger/money';
import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/utils';

export type BalanceTone = 'pos' | 'neg' | 'settled';

/** Tom de um saldo pelo sinal — a teu favor, contra ti, ou em dia (< 1 cêntimo). */
export function balanceTone(cents: number): BalanceTone {
    if (Math.abs(cents) < 0.5) return 'settled';
    return cents > 0 ? 'pos' : 'neg';
}

/** Cor do NÚMERO de um saldo. Única fonte do verde/vermelho do dinheiro —
 *  nunca `text-success-fg`/`text-warning-fg`/`text-danger*` para saldos. */
export const BALANCE_TEXT: Record<BalanceTone, string> = {
    pos: 'text-pos',
    neg: 'text-neg',
    settled: 'text-ink-faint',
};

interface BalanceProps {
    /** Saldo em cêntimos — positivo = a teu favor. */
    cents: number;
    /** Etiqueta por cima do valor, em minúsculas de frase ("devem-te", "deves"). */
    labels: { pos: string; neg: string };
    /** O que mostrar quando está em dia (sem valor). */
    settledLabel?: string;
    /** `row` — à direita de uma linha de lista; `hero` — o número do ecrã. */
    size?: 'row' | 'hero';
    align?: 'end' | 'center';
    className?: string;
}

const SIZES = {
    row: { label: 'text-xs font-medium', value: 'text-base font-semibold tracking-tight' },
    hero: { label: 'text-sm font-medium', value: 'text-4xl font-bold tracking-tight' },
};

/**
 * Etiqueta + valor de um saldo (Manifesto, Fase 15): a etiqueta perde em
 * tamanho, peso E cor (pequena, média, cinzenta) para o número brilhar
 * (maior, semibold, verde/vermelho). Sem maiúsculas — gritavam mais do que o
 * próprio valor.
 */
export function Balance({ cents, labels, settledLabel = 'Em dia', size = 'row', align = 'end', className }: BalanceProps) {
    const tone = balanceTone(cents);
    const s = SIZES[size];
    const alignClass = align === 'center' ? 'text-center' : 'text-right';

    if (tone === 'settled') {
        return <p className={cn('text-sm text-ink-faint shrink-0', alignClass, className)}>{settledLabel}</p>;
    }

    return (
        <div className={cn('shrink-0', alignClass, className)}>
            <p className={cn(s.label, 'text-ink-soft')}>{tone === 'pos' ? labels.pos : labels.neg}</p>
            <Money value={Math.abs(fromCents(cents))} as="p" className={cn(s.value, BALANCE_TEXT[tone])} />
        </div>
    );
}
