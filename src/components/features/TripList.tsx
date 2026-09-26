'use client';

import { useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';
import type { Trip } from '@/lib/types';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { usePrefetchOnIntent } from '@/hooks/usePrefetch';
import { formatDayMonthAbbrev } from '@/lib/expenseDisplay';
import { cn } from '@/lib/utils';

/** Estado da viagem no ícone + uma palavra no subtítulo — sem pastilha
 *  colorida. "Fechada" é um estado normal, não um erro: neutro, não vermelho. */
const STATUS_META: Record<Trip['status'], { label: string; icon: IconName; tile: string }> = {
    open: { label: 'Aberta', icon: 'local_grocery_store', tile: 'bg-info-bg text-info-fg' },
    in_progress: { label: 'Em compras', icon: 'shopping_cart', tile: 'bg-warning-bg text-warning-fg' },
    closed: { label: 'Fechada', icon: 'lock', tile: 'bg-surface-sunken text-ink-faint' },
};

export interface TripAdminActions {
    onEdit: (trip: Trip) => void;
    /** Só em viagens "Em compras". */
    onFinish: (trip: Trip) => void;
    /** Só em viagens fechadas — abre "Lançar despesa da viagem". */
    onLaunchExpense: (trip: Trip) => void;
    onDelete: (trip: Trip) => void;
}

interface TripListProps {
    trips: Trip[];
    hrefFor: (trip: Trip) => string;
    onOpen: (trip: Trip) => void;
    /** Ausente para membros — as linhas ficam só de leitura (sem "⋯"). */
    admin?: TripAdminActions;
    /** Viagens que já deram origem a uma despesa — sem pílula "Lançar despesa". */
    tripIdsWithExpense?: Set<string>;
}

/**
 * Lista de viagens do grupo em linhas compactas (mesma forma do `ExpenseRow`),
 * agrupadas em "Em curso" e "Fechadas" — estas colapsadas por omissão, como os
 * grupos em dia no Início. Substitui os `TripCard` grandes (Fase 15): cada um
 * ocupava ~200pt para nome, data e estado, com "Sem descrição" e 3–4 ícones
 * soltos. As ações de admin vivem no menu "⋯"; só "Lançar despesa" (o passo
 * seguinte natural de uma viagem fechada) fica visível na linha.
 */
export function TripList({ trips, hrefFor, onOpen, admin, tripIdsWithExpense }: TripListProps) {
    const [showClosed, setShowClosed] = useState(false);
    const [menuTrip, setMenuTrip] = useState<Trip | null>(null);

    const active = trips.filter((t) => t.status !== 'closed');
    const closed = trips.filter((t) => t.status === 'closed');

    const renderRows = (list: Trip[]) => (
        <div className="divide-y divide-hairline">
            {list.map((trip) => (
                <TripRow
                    key={trip.id}
                    trip={trip}
                    href={hrefFor(trip)}
                    onOpen={() => onOpen(trip)}
                    onMenu={admin ? () => setMenuTrip(trip) : undefined}
                    onLaunchExpense={
                        admin && trip.status === 'closed' && !tripIdsWithExpense?.has(trip.id)
                            ? () => admin.onLaunchExpense(trip)
                            : undefined
                    }
                />
            ))}
        </div>
    );

    return (
        <div className="space-y-4">
            {active.length > 0 ? (
                <section className="card overflow-hidden">
                    <h3 className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Em curso</h3>
                    {renderRows(active)}
                </section>
            ) : (
                <p className="px-1 text-sm text-ink-faint">Nenhuma viagem em curso.</p>
            )}

            {closed.length > 0 && showClosed && (
                <section className="card overflow-hidden">
                    <h3 className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Fechadas</h3>
                    {renderRows(closed)}
                </section>
            )}
            {closed.length > 0 && (
                <button
                    type="button"
                    onClick={() => setShowClosed((v) => !v)}
                    aria-expanded={showClosed}
                    className="w-full py-2.5 rounded-full border border-hairline-strong text-sm font-semibold text-ink-soft hover:bg-surface-sunken transition-colors"
                >
                    {showClosed
                        ? 'Ocultar viagens fechadas'
                        : `Mostrar ${closed.length} ${closed.length === 1 ? 'viagem fechada' : 'viagens fechadas'}`}
                </button>
            )}

            {admin && (
                <ActionSheet
                    isOpen={menuTrip !== null}
                    onClose={() => setMenuTrip(null)}
                    title={menuTrip?.name ?? 'Viagem'}
                    actions={
                        menuTrip
                            ? [
                                  { icon: 'edit', label: 'Editar viagem', onSelect: () => admin.onEdit(menuTrip) },
                                  {
                                      icon: 'done',
                                      label: 'Terminar viagem',
                                      onSelect: () => admin.onFinish(menuTrip),
                                      hidden: menuTrip.status !== 'in_progress',
                                  },
                                  {
                                      icon: 'calculate',
                                      label: 'Lançar despesa',
                                      onSelect: () => admin.onLaunchExpense(menuTrip),
                                      hidden: menuTrip.status !== 'closed',
                                  },
                                  {
                                      icon: 'delete_outline',
                                      label: 'Eliminar viagem',
                                      tone: 'danger',
                                      onSelect: () => admin.onDelete(menuTrip),
                                  },
                              ]
                            : []
                    }
                />
            )}
        </div>
    );
}

interface TripRowProps {
    trip: Trip;
    href: string;
    onOpen: () => void;
    onMenu?: () => void;
    onLaunchExpense?: () => void;
}

function TripRow({ trip, href, onOpen, onMenu, onLaunchExpense }: TripRowProps) {
    const { trigger } = useWebHaptics();
    const prefetch = usePrefetchOnIntent(href);
    const { day, month } = formatDayMonthAbbrev(trip.created);
    const meta = STATUS_META[trip.status];
    const description = trip.description?.trim();

    return (
        <div className="flex items-center hover:bg-surface-sunken transition-colors">
            <button
                type="button"
                {...prefetch}
                onClick={() => {
                    trigger();
                    onOpen();
                }}
                className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-3 text-left"
            >
                <div className="w-8 flex flex-col items-center shrink-0">
                    <span className="text-xs font-medium text-ink-faint">{month}</span>
                    <span className="text-base font-semibold text-ink-soft leading-none">{day}</span>
                </div>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', meta.tile)}>
                    <Icon name={meta.icon} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink truncate">{trip.name}</p>
                    <p className="text-xs text-ink-soft truncate mt-0.5">
                        {meta.label}
                        {description && ` · ${description}`}
                    </p>
                </div>
            </button>
            {onLaunchExpense && (
                <button
                    type="button"
                    onClick={onLaunchExpense}
                    className="shrink-0 h-8 px-3 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300 text-xs font-semibold active:scale-95 transition"
                >
                    Lançar despesa
                </button>
            )}
            {onMenu ? (
                <button
                    type="button"
                    onClick={onMenu}
                    aria-label={`Ações da viagem ${trip.name}`}
                    className="shrink-0 w-10 h-10 mr-2 rounded-full flex items-center justify-center text-ink-soft hover:bg-hairline transition-colors"
                >
                    <Icon name="more_horiz" className="text-xl" />
                </button>
            ) : (
                <span className="w-4 shrink-0" />
            )}
        </div>
    );
}
