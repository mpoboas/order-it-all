import { formatEURParts } from '@/lib/money';
import { cn } from '@/lib/utils';

interface MoneyProps {
    /** Valor em euros. */
    value: number;
    /** Elemento a renderizar (por omissão `<span>`). */
    as?: 'span' | 'p' | 'div';
    className?: string;
}

/**
 * Apresenta um valor monetário — sempre `pt-PT` (`1234,50 €`) e com dígitos de
 * largura fixa (`tabular-nums`) para alinharem em colunas e não "dançarem" ao
 * mudar. O "€" sai a 0.75em e peso médio: o número é que é a informação, o
 * símbolo só a qualifica (Manifesto, Fase 15). Toda a UI que mostra dinheiro
 * devia passar por aqui — `formatEUR` fica para texto corrido (toasts,
 * notificações, `aria-label`).
 */
export function Money({ value, as: Tag = 'span', className }: MoneyProps) {
    const { number, symbol } = formatEURParts(value);
    return (
        <Tag className={cn('tabular-nums whitespace-nowrap', className)}>
            {number}
            <span className="text-[0.75em] font-medium">{' '}{symbol}</span>
        </Tag>
    );
}
