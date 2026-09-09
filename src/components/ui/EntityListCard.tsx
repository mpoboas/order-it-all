'use client';

import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';

export const entityListCardClassName =
  'card card-hover text-left w-full group relative flex flex-col p-5 gap-4 animate-fade-in-up active:scale-[0.98] transition hover:shadow-md';

export function EntityCardDivider() {
  return <div className="h-px w-full bg-gray-100 dark:bg-slate-700/60" />;
}

export function EntityMetaItem({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] shrink-0">
      <span
        className="material-icons text-[18px] text-[var(--text-muted)] leading-none"
        aria-hidden
      >
        {icon}
      </span>
      {children}
    </span>
  );
}

export type EntityStatusPillVariant =
  | 'open'
  | 'closed'
  | 'in_progress'
  | 'creator'
  | 'admin';

const STATUS_PILL_STYLES: Record<
  EntityStatusPillVariant,
  { className: string; icon: string; compact?: boolean }
> = {
  open: {
    className:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300',
    icon: 'lock_open',
  },
  closed: {
    className: 'bg-red-50 text-red-700 dark:bg-red-900/35 dark:text-red-300',
    icon: 'lock',
  },
  in_progress: {
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300',
    icon: 'shopping_cart',
  },
  creator: {
    className:
      'bg-amber-50 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300',
    icon: 'star',
  },
  admin: {
    className:
      'bg-violet-50 text-violet-700 dark:bg-violet-900/35 dark:text-violet-300',
    icon: 'admin_panel_settings',
  },
};

export function EntityStatusPill({
  variant,
  children,
}: {
  variant: EntityStatusPillVariant;
  children: React.ReactNode;
}) {
  const style = STATUS_PILL_STYLES[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        style.compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-xs',
        style.className
      )}
    >
      <span
        className={cn(
          'material-icons',
          style.compact ? 'text-[14px]' : 'text-[16px]'
        )}
        aria-hidden
      >
        {style.icon}
      </span>
      {children}
    </span>
  );
}

export function EntityCardFooter({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[32px]">
      <div className="flex flex-wrap items-center gap-2 min-w-0">{left}</div>
      <div className="flex items-center shrink-0">
        {right}
        <EntityCardChevron />
      </div>
    </div>
  );
}

export function EntityCardChevron() {
  return (
    <span
      className="material-icons text-[22px] text-[var(--text-muted)] group-hover:text-violet-500 transition-colors p-2"
      aria-hidden
    >
      chevron_right
    </span>
  );
}

export function EntityCardActionIcon({
  title,
  className,
  onActivate,
  hapticError,
  children,
}: {
  title: string;
  className?: string;
  onActivate: (e: React.MouseEvent | React.KeyboardEvent) => void;
  hapticError?: boolean;
  children: React.ReactNode;
}) {
  const { trigger } = useWebHaptics();

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        if (hapticError) trigger('error');
        else trigger();
        onActivate(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (hapticError) trigger('error');
          else trigger();
          onActivate(e);
        }
      }}
      // Não deixar o toque/hover subir ao card — senão dispara o
      // `usePrefetchOnIntent` do card (RSC completo) ao carregar num ícone.
      onPointerEnter={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      className={cn(
        'p-2 rounded-lg transition-colors text-[var(--text-muted)]',
        className
      )}
    >
      {children}
    </span>
  );
}

export function EntityCardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        'text-lg font-bold text-[var(--text-primary)] line-clamp-2 leading-snug group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors',
        className
      )}
    >
      {children}
    </h3>
  );
}

export function EntityCardAsideTotal({ value }: { value: string }) {
  return (
    <div className="text-right shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Total
      </p>
      <p className="text-xl font-bold text-violet-600 dark:text-violet-400 tabular-nums leading-tight mt-0.5">
        {value}
      </p>
    </div>
  );
}
