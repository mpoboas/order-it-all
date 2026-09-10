'use client';

import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';

export const entityListCardClassName =
  'card card-hover text-left w-full group relative flex flex-col p-5 gap-4 animate-fade-in-up active:scale-[0.98] transition hover:shadow-md';

export function EntityCardDivider() {
  return <div className="h-px w-full bg-hairline" />;
}

export function EntityMetaItem({
  icon,
  children,
}: {
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] shrink-0">
      <Icon name={icon} className="text-[18px] text-[var(--text-muted)] leading-none" />
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
  { className: string; icon: IconName; compact?: boolean }
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
      'bg-primary-50 text-primary-700 dark:bg-primary-900/35 dark:text-primary-300',
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
      <Icon name={style.icon} className={style.compact ? 'text-[14px]' : 'text-[16px]'} />
      {children}
    </span>
  );
}

export type CardActionTone = 'default' | 'primary' | 'danger' | 'warning';

export interface CardAction {
  icon: IconName;
  /** Rótulo acessível (aria-label). */
  label: string;
  onActivate: (e: React.MouseEvent | React.KeyboardEvent) => void;
  tone?: CardActionTone;
  /** Ação em curso — spinner + ignora toques. */
  busy?: boolean;
  /** Não renderiza — açúcar para `hidden: !onEdit` no call-site. */
  hidden?: boolean;
}

const ACTION_TONE: Record<CardActionTone, string> = {
  default: 'hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
  primary:
    'hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20',
  danger:
    'hover:text-danger hover:bg-danger-bg',
  warning:
    'hover:text-warning-fg hover:bg-warning-bg',
};

export function EntityCardFooter({
  left,
  actions,
}: {
  left?: React.ReactNode;
  /** Ícones de ação à direita, antes do chevron. Declarativo — sem JSX solto. */
  actions?: CardAction[];
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[32px]">
      <div className="flex flex-wrap items-center gap-2 min-w-0">{left}</div>
      <div className="flex items-center shrink-0">
        {actions
          ?.filter((a) => !a.hidden)
          .map((a) => (
            <EntityCardActionIcon
              key={a.label}
              title={a.label}
              busy={a.busy}
              hapticError={a.tone === 'danger'}
              className={ACTION_TONE[a.tone ?? 'default']}
              onActivate={a.onActivate}
            >
              <Icon name={a.icon} className="text-[22px]" />
            </EntityCardActionIcon>
          ))}
        <EntityCardChevron />
      </div>
    </div>
  );
}

export function EntityCardChevron() {
  // O glifo `>` do Lucide vive muito ao centro do seu viewBox — sem o `-ml`
  // parece "descolado" do ícone anterior (o olho vê o espaço vazio interno
  // + o padding). Mesmo tamanho (22px) que os EntityCardActionIcon.
  return (
    <Icon
      name="chevron_right"
      className="-ml-1 text-[22px] text-[var(--text-muted)] group-hover:text-primary-500 transition-colors box-content p-2"
    />
  );
}

export function EntityCardActionIcon({
  title,
  className,
  onActivate,
  hapticError,
  busy,
  children,
}: {
  title: string;
  className?: string;
  onActivate: (e: React.MouseEvent | React.KeyboardEvent) => void;
  hapticError?: boolean;
  /** Ação em curso — mostra spinner e ignora novos toques (anti duplo-submit). */
  busy?: boolean;
  children: React.ReactNode;
}) {
  const { trigger } = useWebHaptics();

  const activate = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (busy) return;
    if (hapticError) trigger('error');
    else trigger();
    onActivate(e);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-busy={busy || undefined}
      onClick={(e) => {
        e.stopPropagation();
        activate(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          activate(e);
        }
      }}
      // Não deixar o toque/hover subir ao card — senão dispara o
      // `usePrefetchOnIntent` do card (RSC completo) ao carregar num ícone.
      onPointerEnter={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      className={cn(
        'p-2 rounded-lg transition-colors text-[var(--text-muted)]',
        busy && 'opacity-70 pointer-events-none',
        className
      )}
    >
      {busy ? (
        <span
          className="block w-[22px] h-[22px] rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden
        />
      ) : (
        children
      )}
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
        'text-lg font-bold text-[var(--text-primary)] line-clamp-2 leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors',
        className
      )}
    >
      {children}
    </h3>
  );
}

export function EntityCardAsideTotal({ value }: { value: number }) {
  return (
    <div className="text-right shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Total
      </p>
      <Money
        as="p"
        value={value}
        className="text-xl font-bold text-primary-600 dark:text-primary-400 leading-tight mt-0.5"
      />
    </div>
  );
}
