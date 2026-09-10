'use client';

import { useState } from 'react';
import { cn, getProductEmoji } from '@/lib/utils';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { Money } from '@/components/ui/Money';
import { ShoppingItemMeta } from '@/components/features/ShoppingItemMeta';
import type { Item } from '@/lib/types';
import { Icon, type IconName } from '@/components/ui/Icon';

const STATUS_CONFIG: Record<
  Item['found_status'],
  { icon: IconName; label: string; dot: string; bar: string; tint: string }
> = {
  pending: {
    icon: 'hourglass_empty',
    label: 'Por comprar',
    dot: 'bg-status-pending',
    bar: 'bg-status-pending',
    tint: 'bg-surface',
  },
  found: {
    icon: 'check',
    label: 'Comprado',
    dot: 'bg-status-bought',
    bar: 'bg-status-bought',
    tint: 'bg-success-bg/30',
  },
  not_available: {
    icon: 'close',
    label: 'Não tinha',
    dot: 'bg-status-missing',
    bar: 'bg-status-missing',
    tint: 'bg-danger-bg/30',
  },
};

const NOTE_CHIP = 'bg-warning-bg text-warning-fg';

interface AdminShoppingItemCardProps {
  item: Item;
  compact?: boolean;
  onOpenEdit: () => void;
  onCycleStatus: (e: React.MouseEvent) => void;
}

export function AdminShoppingItemCard({
  item,
  compact = false,
  onOpenEdit,
  onCycleStatus,
}: AdminShoppingItemCardProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const status = STATUS_CONFIG[item.found_status];
  const dimmed = item.found_status !== 'pending' && 'opacity-50';

  if (compact) {
    return (
      <div className={cn('rounded-2xl border border-hairline shadow-sm overflow-hidden', status.tint)}>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={onCycleStatus}
            title={status.label}
            className={cn(
              'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform',
              status.dot,
            )}
          >
            <Icon name={status.icon} className="text-sm" />
          </button>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenEdit}>
            <p className={cn('font-bold text-sm text-ink truncate leading-tight', dimmed)}>
              {item.name}
            </p>
          </div>

          <span className="shrink-0 text-xs font-black text-ink-faint tabular-nums">
            ×{item.quantity}
          </span>

          {item.notes && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNotesOpen((v) => !v);
              }}
              title="Ver notas"
              className={cn(
                'shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                notesOpen ? 'bg-warning-fg text-white' : NOTE_CHIP,
              )}
            >
              <Icon name="sticky_note_2" className="text-[13px]" />
            </button>
          )}

          <span className="shrink-0 text-xs font-bold text-ink tabular-nums w-12 text-right">
            <Money value={item.price || 0} />
          </span>
        </div>

        {notesOpen && item.notes && (
          <div className="bg-warning-bg text-warning-fg text-xs py-1.5 px-3 border-t border-warning-fg/25 italic">
            {item.notes}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative group transition duration-200 rounded-[20px] overflow-hidden border border-hairline shadow-sm',
        status.tint,
      )}
    >
      <div className="flex gap-4 items-start p-4 pb-4">
        <div
          onClick={onOpenEdit}
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 cursor-pointer overflow-hidden border border-hairline',
            item.image_url ? 'bg-surface' : 'bg-app',
          )}
        >
          {item.image_url ? (
            <RemoteImage
              src={item.image_url}
              alt={item.name}
              width={48}
              height={48}
              className="w-full h-full object-contain mix-blend-multiply p-1"
            />
          ) : (
            <span>{getProductEmoji(item.name)}</span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center" onClick={onOpenEdit}>
          <div className="flex justify-between items-start gap-2 cursor-pointer mb-1">
            <h4 className={cn('font-bold text-ink text-base leading-tight', dimmed)}>
              {item.name}
            </h4>
            <div className="text-right flex flex-col items-end">
              <Money
                value={item.price > 0 ? item.price : 0}
                className="font-bold text-ink whitespace-nowrap"
              />
              {item.price > 0 && item.quantity > 1 && (
                <span className="text-[10px] text-ink-faint font-medium leading-none mt-0.5">
                  p./uni <Money value={item.price / item.quantity} />
                </span>
              )}
            </div>
          </div>

          <ShoppingItemMeta quantity={item.quantity} brand={item.brand} />
        </div>
      </div>

      {item.notes && (
        <div className="bg-warning-bg text-warning-fg text-sm py-2 px-4 border-l-4 border-warning-fg/50 flex items-start gap-2 w-full">
          <span className="font-bold shrink-0">Notas:</span>
          <span className="italic">{item.notes}</span>
        </div>
      )}

      <div
        onClick={onCycleStatus}
        className={cn(
          'w-full py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-white cursor-pointer active:brightness-90 transition select-none',
          status.bar,
        )}
      >
        <Icon name={status.icon} className="text-sm" />
        {status.label}
      </div>
    </div>
  );
}
