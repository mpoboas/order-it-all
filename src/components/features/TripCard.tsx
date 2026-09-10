'use client';

import type { Trip } from '@/lib/types';
import {
  entityListCardClassName,
  EntityCardDivider,
  EntityCardFooter,
  EntityMetaItem,
  EntityCardTitle,
  EntityStatusPill,
  type CardAction,
} from '@/components/ui/EntityListCard';
import { formatRelativeOrDate, cn } from '@/lib/utils';
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

  const adminActions: CardAction[] = isAdmin
    ? [
        {
          icon: 'edit',
          label: 'Editar viagem',
          tone: 'primary',
          onActivate: (e) => onEdit?.(e as React.MouseEvent, trip),
          hidden: !onEdit,
        },
        {
          icon: 'done',
          label: 'Terminar viagem',
          tone: 'warning',
          onActivate: (e) => onClose?.(e as React.MouseEvent, trip.id),
          hidden: trip.status !== 'in_progress' || !onClose,
        },
        {
          icon: 'calculate',
          label: 'Gerar divisão',
          tone: 'primary',
          busy: isSplitting,
          onActivate: (e) => onSplit?.(e as React.MouseEvent, trip),
          hidden: trip.status !== 'closed' || !onSplit,
        },
        {
          icon: 'delete_outline',
          label: 'Eliminar viagem',
          tone: 'danger',
          onActivate: (e) => onDelete?.(e as React.MouseEvent, trip.id),
          hidden: !onDelete,
        },
      ]
    : [];

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
          {formatRelativeOrDate(trip.created)}
        </EntityMetaItem>
      </div>

      <EntityCardDivider />

      <EntityCardFooter
        left={<TripStatusPill status={trip.status} />}
        actions={adminActions}
      />
    </button>
  );
}
