'use client';

import {
  getActiveParticipants,
  getSplitItemMode,
} from '@/lib/splitItemAllocation';
import type { SplitItem } from '@/lib/types';
import { calculateParticipantTotal } from '@/lib/splitShare';
import { isItemLocked } from '@/lib/splitItems';
import { formatCurrency, cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { SplitItemShareRow } from '@/components/features/SplitItemShareRow';

interface SplitParticipantItemsViewProps {
  items: SplitItem[];
  allParticipants: string[];
  participantName: string;
  togglingIdx: number | null;
  onToggle: (itemIndex: number, include: boolean) => void;
  /** Opens the item detail/allocation sheet (also used read-only to view who divides). */
  onOpenAllocationSheet: (itemIndex: number) => void;
  readOnly?: boolean;
  introText?: string;
  className?: string;
  showFooter?: boolean;
  footerOffset?: 'bottom-nav' | 'safe';
  participantAvatarUrl?: (name: string) => string | undefined;
}

export function SplitParticipantItemsView({
  items,
  allParticipants,
  participantName,
  togglingIdx,
  onToggle,
  onOpenAllocationSheet,
  readOnly = false,
  introText,
  className,
  showFooter = true,
  footerOffset = 'safe',
  participantAvatarUrl,
}: SplitParticipantItemsViewProps) {
  const myTotal = calculateParticipantTotal(items, participantName);

  const resolvedIntro =
    introText ??
    (readOnly
      ? 'Consulta os itens em que participas. Toca num item para ver quem divide.'
      : 'Marca os itens em que participaste. Podes também alterar o modo de divisão para o mais adequado.');

  return (
    <div className={className}>
      <p className="text-sm text-[var(--text-secondary)] mb-4">{resolvedIntro}</p>

      <ul className="space-y-3">
        {items.map((item, idx) => {
          const itemMode = getSplitItemMode(item);
          const isCustomMode = itemMode !== 'equal';
          const checked = getActiveParticipants(item).includes(participantName);
          const busy = togglingIdx === idx;
          const locked = isItemLocked(item);
          const cannotUncheck = checked && locked;
          const disabled = readOnly || busy || (cannotUncheck && !isCustomMode);

          const handlePrimaryAction = () => {
            if (readOnly || busy) return;
            if (isCustomMode) {
              onOpenAllocationSheet(idx);
              return;
            }
            if (cannotUncheck) return;
            onToggle(idx, !checked);
          };

          return (
            <li key={idx} className="card p-4 flex items-start gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={handlePrimaryAction}
                className={cn(
                  'w-11 h-11 rounded-xl border-2 flex items-center justify-center shrink-0 transition-colors',
                  checked
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'border-[var(--border)] bg-[var(--bg-primary)]',
                  (cannotUncheck || readOnly) && 'opacity-60 cursor-not-allowed'
                )}
                aria-pressed={checked}
                title={
                  readOnly
                    ? 'Divisão fechada'
                    : isCustomMode
                      ? 'Ajustar a tua parte'
                      : cannotUncheck
                        ? 'Item bloqueado'
                        : checked
                          ? 'Remover deste item'
                          : 'Marcar que participaste'
                }
              >
                {checked && (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <p className="font-medium text-[var(--text-primary)] break-words leading-snug">
                        {item.name || 'Item sem nome'}
                      </p>
                      {locked && (
                        <span
                          className="material-icons text-[16px] text-[var(--text-muted)] shrink-0"
                          title="Bloqueado"
                          aria-hidden
                        >
                          lock
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">
                      Total do item:{' '}
                      <span className="font-semibold text-violet-600 dark:text-violet-400">
                        {formatCurrency(item.price)}
                      </span>
                    </p>
                  </div>
                </div>

                {checked && (
                  <SplitItemShareRow
                    item={item}
                    allParticipants={allParticipants}
                    myName={participantName}
                    onClick={() => onOpenAllocationSheet(idx)}
                    participantAvatarUrl={participantAvatarUrl}
                  />
                )}
              </div>

              {busy && (
                <div className="shrink-0 pt-2">
                  <LoadingSpinner size="sm" />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {items.length === 0 && (
        <p className="text-center text-[var(--text-muted)] py-8 text-sm">
          Ainda não há itens nesta divisão.
        </p>
      )}

      {showFooter && (
        <div
          className={cn(
            'fixed left-0 right-0 p-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] safe-bottom z-30',
            footerOffset === 'bottom-nav'
              ? 'bottom-[calc(var(--bottom-nav-total-height)+var(--dock-gap))]'
              : 'bottom-0'
          )}
        >
          <div className="flex justify-between items-center max-w-lg mx-auto w-full">
            <span className="text-sm text-[var(--text-secondary)]">O teu total</span>
            <span className="text-xl font-bold text-violet-600 dark:text-violet-400">
              {formatCurrency(myTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
