'use client';

import { Avatar } from '@/components/ui/Avatar';
import { getItemSplitLabel } from '@/lib/splitShare';
import { formatCurrency, cn } from '@/lib/utils';

const MAX_VISIBLE = 4;

interface SplitItemShareRowProps {
  itemParticipants: string[];
  allParticipants: string[];
  myName: string;
  itemPrice: number;
  onClick: () => void;
  className?: string;
}

export function SplitItemShareRow({
  itemParticipants,
  allParticipants,
  myName,
  itemPrice,
  onClick,
  className,
}: SplitItemShareRowProps) {
  const label = getItemSplitLabel(itemParticipants, myName, allParticipants);
  const perPerson =
    itemParticipants.length > 0 ? itemPrice / itemParticipants.length : 0;

  if (itemParticipants.length === 0) {
    return null;
  }

  const visible = itemParticipants.slice(0, MAX_VISIBLE);
  const overflow = itemParticipants.length - visible.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 mt-2 min-w-0 max-w-full w-full text-left',
        'rounded-lg -mx-1 px-1 py-1 hover:bg-violet-50 dark:hover:bg-violet-900/20 active:scale-[0.99] transition-colors',
        className
      )}
      aria-label={label ? `Ver divisão: ${label}` : 'Ver quem divide este item'}
    >
      <div className="flex items-center shrink-0 min-w-0 flex-1">
        <div className="flex items-center shrink-0">
          {visible.map((name, index) => (
            <Avatar
              key={name}
              name={name}
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
        {label && (
          <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 leading-tight truncate ml-2">
            {label}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 shrink-0 ml-1">
        <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
          {formatCurrency(perPerson)}
        </span>
        <span className="text-[10px] font-medium text-[var(--text-muted)]">/pessoa</span>
      </div>
      <svg
        className="w-4 h-4 text-violet-400 dark:text-violet-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
