'use client';

import type { Trip } from '@/lib/types';
import {
  entityListCardClassName,
  EntityCardDivider,
  EntityCardFooter,
  EntityMetaItem,
  EntityCardTitle,
  EntityStatusPill,
  EntityCardActionIcon,
} from '@/components/ui/EntityListCard';
import { getRelativeTime, cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';
import { usePrefetchOnIntent } from '@/hooks/usePrefetch';

interface TripCardProps {
  trip: Trip;
  onClick?: () => void;
  /** Rota do detalhe — pré-carregada no primeiro toque/hover. */
  href?: string;
  isAdmin?: boolean;
  onEdit?: (e: React.MouseEvent, trip: Trip) => void;
  onDelete?: (e: React.MouseEvent, tripId: string) => void;
  onClose?: (e: React.MouseEvent, tripId: string) => void;
  onSplit?: (e: React.MouseEvent, trip: Trip) => void;
  /** Divisão a ser gerada a partir desta viagem — mostra spinner no ícone. */
  isSplitting?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function TripStatusPill({ status }: { status: Trip['status'] }) {
  if (status === 'open') {
    return <EntityStatusPill variant="open">Aberta</EntityStatusPill>;
  }
  if (status === 'in_progress') {
    return <EntityStatusPill variant="in_progress">Em compras</EntityStatusPill>;
  }
  return <EntityStatusPill variant="closed">Fechada</EntityStatusPill>;
}

export function TripCard({
  trip,
  onClick,
  href,
  isAdmin = false,
  onEdit,
  onDelete,
  onClose,
  onSplit,
  isSplitting = false,
  className,
  style,
}: TripCardProps) {
  const { trigger } = useWebHaptics();
  const prefetch = usePrefetchOnIntent(href);
  const description = trip.description?.trim();

  const adminActions = isAdmin ? (
    <>
      {onEdit && (
        <EntityCardActionIcon
          title="Editar viagem"
          className="hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
          onActivate={(e) => onEdit(e as React.MouseEvent, trip)}
        >
          <span className="material-icons text-[22px]" aria-hidden>
            edit
          </span>
        </EntityCardActionIcon>
      )}
      {trip.status === 'in_progress' && onClose && (
        <EntityCardActionIcon
          title="Terminar viagem"
          className="hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          onActivate={(e) => onClose(e as React.MouseEvent, trip.id)}
        >
          <span className="material-icons text-[22px]" aria-hidden>
            done
          </span>
        </EntityCardActionIcon>
      )}
      {trip.status === 'closed' && onSplit && (
        <EntityCardActionIcon
          title="Gerar divisão"
          busy={isSplitting}
          className="hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
          onActivate={(e) => onSplit(e as React.MouseEvent, trip)}
        >
          <span className="material-icons text-[22px]" aria-hidden>
            calculate
          </span>
        </EntityCardActionIcon>
      )}
      {onDelete && (
        <EntityCardActionIcon
          title="Eliminar viagem"
          hapticError
          className="hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          onActivate={(e) => onDelete(e as React.MouseEvent, trip.id)}
        >
          <span className="material-icons text-[22px]" aria-hidden>
            delete_outline
          </span>
        </EntityCardActionIcon>
      )}
    </>
  ) : null;

  return (
    <button
      type="button"
      {...prefetch}
      onClick={() => {
        trigger();
        onClick?.();
      }}
      className={cn(entityListCardClassName, className)}
      style={style}
    >
      <div className="min-w-0">
        <EntityCardTitle>{trip.name}</EntityCardTitle>
        <p className="text-sm text-[var(--text-muted)] line-clamp-2 mt-2">
          {description || 'Sem descrição'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <EntityMetaItem icon="schedule">
          {getRelativeTime(trip.created)}
        </EntityMetaItem>
      </div>

      <EntityCardDivider />

      <EntityCardFooter
        left={<TripStatusPill status={trip.status} />}
        right={adminActions}
      />
    </button>
  );
}
