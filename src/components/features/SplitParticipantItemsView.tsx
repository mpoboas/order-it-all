'use client';

import { useState } from 'react';
import type { SplitItem } from '@/lib/types';
import { calculateParticipantTotal } from '@/lib/splitShare';
import { isItemLocked } from '@/lib/splitItems';
import { formatCurrency, cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { SplitItemShareRow } from '@/components/features/SplitItemShareRow';
import { SplitItemParticipantsSheet } from '@/components/features/SplitItemParticipantsSheet';

interface SplitParticipantItemsViewProps {
  items: SplitItem[];
  allParticipants: string[];
  participantName: string;
  togglingIdx: number | null;
  onToggle: (itemIndex: number, include: boolean) => void;
  readOnly?: boolean;
  introText?: string;
  className?: string;
  showFooter?: boolean;
  footerOffset?: 'bottom-nav' | 'safe';
}

export function SplitParticipantItemsView({
  items,
  allParticipants,
  participantName,
  togglingIdx,
  onToggle,
  readOnly = false,
  introText,
  className,
  showFooter = true,
  footerOffset = 'safe',
}: SplitParticipantItemsViewProps) {
  const [sheetItemIndex, setSheetItemIndex] = useState<number | null>(null);
  const myTotal = calculateParticipantTotal(items, participantName);
  const sheetItem = sheetItemIndex !== null ? items[sheetItemIndex] : null;
  const resolvedIntro =
    introText ??
    (readOnly
      ? 'Consulta os itens em que participas.'
      : 'Marca os itens em que participaste.');

  return (
    <div className={className}>
      <p className="text-sm text-[var(--text-secondary)] mb-4">{resolvedIntro}</p>

      <ul className="space-y-3">
        {items.map((item, idx) => {
          const checked = item.participants.includes(participantName);
          const busy = togglingIdx === idx;
          const locked = isItemLocked(item);
          const cannotUncheck = checked && locked;
          const disabled = readOnly || busy || cannotUncheck;
          return (
            <li key={idx} className="card p-4 flex items-start gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(idx, !checked)}
                className={cn(
                  'w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 transition-colors',
                  checked
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'border-[var(--border)] bg-[var(--bg-primary)]',
                  (cannotUncheck || readOnly) && 'opacity-60 cursor-not-allowed'
                )}
                aria-pressed={checked}
                title={
                  readOnly
                    ? 'Divisão fechada'
                    : cannotUncheck
                      ? 'Item bloqueado — não podes remover-te'
                      : undefined
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
                <div className="flex items-center gap-1.5 min-w-0">
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
                <p className="text-sm text-violet-600 dark:text-violet-400 font-semibold">
                  {formatCurrency(item.price)}
                </p>
                <SplitItemShareRow
                  itemParticipants={item.participants}
                  allParticipants={allParticipants}
                  myName={participantName}
                  itemPrice={item.price}
                  onClick={() => setSheetItemIndex(idx)}
                />
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

      <SplitItemParticipantsSheet
        isOpen={sheetItemIndex !== null}
        onClose={() => setSheetItemIndex(null)}
        item={sheetItem}
        allParticipants={allParticipants}
        myName={participantName}
      />

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
