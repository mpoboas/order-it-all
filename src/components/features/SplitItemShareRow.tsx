'use client';

import { Avatar } from '@/components/ui/Avatar';
import {
  computeParticipantAmount,
  getActiveParticipants,
  getSplitItemMode,
  SPLIT_ITEM_MODE_LABELS,
} from '@/lib/splitItemAllocation';
import { getItemSplitLabel } from '@/lib/splitShare';
import type { SplitItem } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';

const MAX_VISIBLE = 4;

interface SplitItemShareRowProps {
  item: SplitItem;
  allParticipants: string[];
  myName: string;
  onClick: () => void;
  participantAvatarUrl?: (name: string) => string | undefined;
  className?: string;
}

export function SplitItemShareRow({
  item,
  allParticipants,
  myName,
  onClick,
  participantAvatarUrl,
  className,
}: SplitItemShareRowProps) {
  const active = getActiveParticipants(item);
  const mode = getSplitItemMode(item);
  const isCustomMode = mode !== 'equal';
  const participating = active.includes(myName);
  const label = getItemSplitLabel(active, myName, allParticipants);
  const myAmount = participating ? computeParticipantAmount(item, myName) : 0;

  if (active.length === 0) {
    return null;
  }

  const visible = active.slice(0, MAX_VISIBLE);
  const overflow = active.length - visible.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 mt-2.5 min-w-0 max-w-full w-full text-left',
        'rounded-xl px-3 py-2.5 bg-[var(--bg-tertiary)]/80 border border-[var(--border)]',
        'hover:bg-violet-50 dark:hover:bg-violet-900/20 active:scale-[0.99] transition-colors',
        className
      )}
      aria-label="Ver quem divide este item"
    >
      <div className="flex items-center shrink-0">
        {visible.map((name, index) => (
          <Avatar
            key={name}
            name={name}
            src={participantAvatarUrl?.(name)}
            size="xs"
            stacked
            className={index > 0 ? '-ml-2' : undefined}
          />
        ))}
        {overflow > 0 && (
          <span
            className={cn(
              'w-5 h-5 -ml-2 rounded-full flex items-center justify-center',
              'bg-violet-100 dark:bg-violet-900/50 text-[9px] font-bold text-violet-700 dark:text-violet-300',
              'ring-2 ring-white dark:ring-slate-800'
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isCustomMode && (
          <span className="block text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            {SPLIT_ITEM_MODE_LABELS[mode]}
          </span>
        )}
        {label && (
          <span className="block text-xs font-medium text-[var(--text-secondary)] break-words">
            {label}
          </span>
        )}
      </div>
      {participating && (
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
            {formatCurrency(myAmount)}
          </span>
          {active.length > 1 && mode === 'equal' && (
            <span className="text-[10px] font-medium text-[var(--text-muted)]">
              /pessoa
            </span>
          )}
        </div>
      )}
      <svg
        className="w-4 h-4 text-[var(--text-muted)] shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
