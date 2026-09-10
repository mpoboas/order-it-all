'use client';

import { useState } from 'react';
import { cn, formatCurrency, getProductEmoji } from '@/lib/utils';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { ShoppingItemMeta } from '@/components/features/ShoppingItemMeta';
import type { Item } from '@/lib/types';
import { Icon, type IconName } from '@/components/ui/Icon';

const STATUS_CONFIG: Record<Item['found_status'], { icon: IconName; label: string }> = {
  pending: { icon: 'hourglass_empty', label: 'Por comprar' },
  found: { icon: 'check', label: 'Comprado' },
  not_available: { icon: 'close', label: 'Não tinha' },
};

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

  const statusBgClass =
    item.found_status === 'found'
      ? 'bg-emerald-50/30 dark:bg-emerald-900/10'
      : item.found_status === 'not_available'
        ? 'bg-red-50/30 dark:bg-red-900/10'
        : 'bg-white dark:bg-slate-800';

  const statusDotClass =
    item.found_status === 'pending'
      ? 'bg-amber-500'
      : item.found_status === 'found'
        ? 'bg-emerald-500'
        : 'bg-red-500';

  if (compact) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden',
          statusBgClass
        )}
      >
        <div className="flex items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={onCycleStatus}
            title={status.label}
            className={cn(
              'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform',
              statusDotClass
            )}
          >
            <Icon name={status.icon} className="text-sm" />
          </button>

          <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenEdit}>
            <p
              className={cn(
                'font-bold text-sm text-[var(--text-primary)] truncate leading-tight',
                item.found_status !== 'pending' && 'opacity-50'
              )}
            >
              {item.name}
            </p>
          </div>

          <span className="shrink-0 text-xs font-black text-[var(--text-muted)] tabular-nums">
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
                notesOpen
                  ? 'bg-yellow-400 text-yellow-950'
                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
              )}
            >
              <Icon name="sticky_note_2" className="text-[13px]" />
            </button>
          )}

          <span className="shrink-0 text-xs font-bold text-[var(--text-primary)] tabular-nums w-12 text-right">
            {formatCurrency(item.price || 0)}
          </span>
        </div>

        {notesOpen && item.notes && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100 text-xs py-1.5 px-3 border-t border-yellow-200 dark:border-yellow-800 italic">
            {item.notes}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative group transition duration-200 rounded-[20px] overflow-hidden border border-gray-100 dark:border-slate-700 shadow-sm',
        statusBgClass
      )}
    >
      <div className="flex gap-4 items-start p-4 pb-4">
        {/* Image Placeholder or Icon */}
        <div
          onClick={onOpenEdit}
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 cursor-pointer overflow-hidden border border-gray-100 dark:border-slate-700',
            item.image_url ? 'bg-white' : 'bg-[var(--bg-primary)]'
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
            <h4
              className={cn(
                'font-bold text-[var(--text-primary)] text-base leading-tight',
                item.found_status !== 'pending' && 'opacity-50'
              )}
            >
              {item.name}
            </h4>
            <div className="text-right flex flex-col items-end">
              <span className="font-bold text-[var(--text-primary)] whitespace-nowrap">
                {item.price > 0 ? formatCurrency(item.price) : formatCurrency(0)}
              </span>
              {item.price > 0 && item.quantity > 1 && (
                <span className="text-[10px] text-[var(--text-muted)] font-medium leading-none mt-0.5">
                  p./uni {formatCurrency(item.price / item.quantity)}
                </span>
              )}
            </div>
          </div>

          <ShoppingItemMeta quantity={item.quantity} brand={item.brand} />
        </div>
      </div>

      {/* Notes - Full Width, glued to status bar */}
      {item.notes && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100 text-sm py-2 px-4 border-l-4 border-yellow-400 dark:border-yellow-600 flex items-start gap-2 w-full">
          <span className="font-bold shrink-0">Notas:</span>
          <span className="italic">{item.notes}</span>
        </div>
      )}

      {/* Status Bar / Cycle Button */}
      <div
        onClick={onCycleStatus}
        className={cn(
          'w-full py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-white cursor-pointer active:brightness-90 transition select-none',
          item.found_status === 'pending'
            ? 'bg-amber-500 text-amber-700 hover:bg-amber-600'
            : item.found_status === 'found'
              ? 'bg-emerald-500'
              : 'bg-red-500'
        )}
      >
        {item.found_status === 'pending' ? (
          <span className="flex items-center gap-1">
            <Icon name="hourglass_empty" className="text-sm" />
            Por comprar
          </span>
        ) : item.found_status === 'found' ? (
          <>
            <Icon name="check" className="text-sm" />
            Comprado
          </>
        ) : (
          <>
            <Icon name="close" className="text-sm" />
            Não tinha
          </>
        )}
      </div>
    </div>
  );
}
