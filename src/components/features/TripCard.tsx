import React from 'react';
import { Trip } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { getRelativeTime, cn } from '@/lib/utils';

interface TripCardProps {
    trip: Trip;
    onClick?: () => void;
    isAdmin?: boolean;
    onEdit?: (e: React.MouseEvent, trip: Trip) => void;
    onDelete?: (e: React.MouseEvent, tripId: string) => void;
    onClose?: (e: React.MouseEvent, tripId: string) => void;
    onSplit?: (e: React.MouseEvent, trip: Trip) => void;
}

export function TripCard({
    trip,
    onClick,
    isAdmin = false,
    onEdit,
    onDelete,
    onClose,
    onSplit
}: TripCardProps) {

    return (
        <button
            onClick={onClick}
            className={cn(
                'card card-hover p-5 text-left w-full group relative',
                'animate-fade-in-up',
                'active:scale-[0.98] transition-all hover:shadow-lg'
            )}
        >
            {/* Header with Title and Status */}
            <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {trip.name}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                        {trip.description || 'Sem descrição'}
                    </p>
                </div>

                <div className="flex-shrink-0">
                    {trip.status === 'open' && (
                        <Badge variant="open" className="flex items-center shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                            Aberta
                        </Badge>
                    )}
                    {trip.status === 'in_progress' && (
                        <div className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center shadow-sm whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce mr-1.5" />
                            Em Compras
                        </div>
                    )}
                    {trip.status === 'closed' && (
                        <Badge variant="closed" className="shadow-sm">Fechada</Badge>
                    )}
                </div>
            </div>

            {/* Separator */}
            <div className="h-px w-full bg-gray-100 dark:bg-slate-700/50 my-3" />

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3">
                <div className="flex items-center text-sm text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors w-full sm:w-auto">
                    <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {getRelativeTime(trip.created)}
                </div>

                {/* Actions Section */}
                {isAdmin ? (
                    <div onClick={e => e.stopPropagation()} className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0 justify-end">
                        <button
                            onClick={(e) => onEdit?.(e, trip)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            Editar
                        </button>

                        {trip.status === 'in_progress' && (
                            <button
                                onClick={(e) => onClose?.(e, trip.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg transition-colors border border-amber-200 dark:border-amber-800/50"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Terminar
                            </button>
                        )}

                        {trip.status === 'closed' && onSplit && (
                            <button
                                onClick={(e) => onSplit?.(e, trip)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-lg transition-colors border border-violet-200 dark:border-violet-800/50"
                                title="Gerar Divisão de Contas"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                Dividir
                            </button>
                        )}

                        <button
                            onClick={(e) => onDelete?.(e, trip.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Eliminar
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center text-primary-600 dark:text-primary-400 font-bold text-sm group-hover:translate-x-1 transition-transform">
                        Ver pedidos
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                )}
            </div>
        </button>
    );
}
