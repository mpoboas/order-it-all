'use client';

import { monthLabel, type SummaryPeriod } from '@/lib/ledger/summary';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Período do Resumo: "Sempre" (~20%) ou um mês (~80%), com setas para o mês
 * anterior/seguinte — só os meses com despesas (`months`, do mais antigo para
 * o mais recente). Mesmo visual do `SegmentedControl`. Com "Sempre" ativo, o
 * lado do mês mostra o último visto; tocar-lhe (ou numa seta) ativa-o.
 */
export function PeriodPicker({
    months,
    period,
    month,
    onChange,
}: {
    months: SummaryPeriod[];
    period: SummaryPeriod;
    /** O mês mostrado do lado direito (o ativo, ou o último visto). */
    month: SummaryPeriod | null;
    onChange: (period: SummaryPeriod) => void;
}) {
    const index = month ? months.indexOf(month) : -1;
    const monthActive = period !== 'all';
    const prev = index > 0 ? months[index - 1] : null;
    const next = index >= 0 && index < months.length - 1 ? months[index + 1] : null;

    const segment = (active: boolean) =>
        cn(
            'rounded-full text-sm font-semibold transition-colors',
            active ? 'bg-surface text-primary-700 dark:text-primary-300 shadow-sm' : 'text-ink-soft hover:text-ink',
        );
    const arrow =
        'w-8 h-full shrink-0 flex items-center justify-center rounded-full disabled:opacity-30 disabled:cursor-default active:scale-90 transition';

    return (
        <div role="tablist" aria-label="Período" className="flex h-9 p-1 gap-1 bg-surface-sunken rounded-full">
            <button
                type="button"
                role="tab"
                aria-selected={!monthActive}
                onClick={() => monthActive && onChange('all')}
                className={cn('basis-[22%] shrink-0', segment(!monthActive))}
            >
                Sempre
            </button>

            <div className={cn('flex-1 min-w-0 flex items-center', segment(monthActive))}>
                <button
                    type="button"
                    aria-label="Mês anterior"
                    disabled={!prev}
                    onClick={() => prev && onChange(prev)}
                    className={arrow}
                >
                    <Icon name="chevron_left" className="text-lg" />
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={monthActive}
                    disabled={!month}
                    onClick={() => month && !monthActive && onChange(month)}
                    className="flex-1 min-w-0 h-full truncate"
                >
                    {month ? capitalize(monthLabel(month)) : 'Sem despesas'}
                </button>
                <button
                    type="button"
                    aria-label="Mês seguinte"
                    disabled={!next}
                    onClick={() => next && onChange(next)}
                    className={arrow}
                >
                    <Icon name="chevron_right" className="text-lg" />
                </button>
            </div>
        </div>
    );
}
