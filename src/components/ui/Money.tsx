import { formatEUR } from '@/lib/money';
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
 * mudar. Toda a UI que mostra dinheiro devia passar por aqui.
 */
export function Money({ value, as: Tag = 'span', className }: MoneyProps) {
    return <Tag className={cn('tabular-nums', className)}>{formatEUR(value)}</Tag>;
}
