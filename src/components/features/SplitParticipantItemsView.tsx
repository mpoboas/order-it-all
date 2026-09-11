'use client';

import { useState } from 'react';
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
import { Icon } from '@/components/ui/Icon';

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

  // Item trancado + toque no controlo → treme o cadeado (feedback "está fixo").
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const shakeLock = (idx: number) => {
    setShakeIdx(idx);
    setTimeout(() => setShakeIdx((cur) => (cur === idx ? null : cur)), 450);
  };

  const resolvedIntro =
    introText ??
    (readOnly
      ? 'Consulta os itens em que participas. Toca num item para ver quem divide.'
      : 'Marca os itens em que participaste. Podes também alterar o modo de divisão para o mais adequado.');

  return (
    <div className={className}>
      <p className="text-sm text-ink-soft mb-4">{resolvedIntro}</p>

      <ul className="space-y-3">
        {items.map((item, idx) => {
          const itemMode = getSplitItemMode(item);
          const isCustomMode = itemMode !== 'equal';
          const checked = getActiveParticipants(item).includes(participantName);
          const busy = togglingIdx === idx;
          const locked = isItemLocked(item);
          // Trancado = roster congelado: nem entra nem sai. (Modo custom abre a
          // sheet, que tem a sua própria guarda de lock.)
          const frozen = locked && !isCustomMode;
          // Não `disabled` quando `frozen` — precisamos do clique para tremer o
          // cadeado.
          const disabled = readOnly || busy;

          const handlePrimaryAction = () => {
            if (readOnly || busy) return;
            if (isCustomMode) {
              onOpenAllocationSheet(idx);
              return;
            }
            if (frozen) {
              shakeLock(idx);
              return;
            }
            onToggle(idx, !checked);
          };

          return (
            <li key={idx} className="card p-4 flex items-start gap-3">
              <button
                type="button"
                disabled={disabled}
                aria-disabled={frozen || undefined}
                onClick={handlePrimaryAction}
                className={cn(
                  'w-11 h-11 rounded-xl border-2 flex items-center justify-center shrink-0 transition-colors',
                  checked
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-hairline bg-app',
                  (frozen || readOnly) && 'opacity-60 cursor-not-allowed'
                )}
                aria-pressed={checked}
                title={
                  readOnly
                    ? 'Divisão fechada'
                    : isCustomMode
                      ? 'Ajustar a tua parte'
                      : frozen
                        ? 'Item bloqueado — quem participa está fixo'
                        : checked
                          ? 'Remover deste item'
                          : 'Marcar que participaste'
                }
              >
                {checked && (
                  <Icon name="check" className="text-lg" strokeWidth={3} />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <p className="font-medium text-ink break-words leading-snug">
                        {item.name || 'Item sem nome'}
                      </p>
                      {locked && (
                        <Icon
                          name="lock"
                          className={cn(
                            'text-[16px] text-ink-faint shrink-0',
                            shakeIdx === idx && 'lock-shake'
                          )}
                          title="Bloqueado — quem participa está fixo"
                        />
                      )}
                    </div>
                    <p className="text-sm text-ink-faint mt-0.5">
                      Total do item:{' '}
                      <span className="font-semibold text-primary-600 dark:text-primary-400">
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
        <p className="text-center text-ink-faint py-8 text-sm">
          Ainda não há itens nesta divisão.
        </p>
      )}

      {showFooter && (
        <div
          className={cn(
            'fixed left-0 right-0 p-4 bg-surface border-t border-hairline safe-bottom z-30',
            footerOffset === 'bottom-nav'
              ? 'bottom-[calc(var(--bottom-nav-total-height)+var(--dock-gap))]'
              : 'bottom-0'
          )}
        >
          <div className="flex justify-between items-center max-w-lg mx-auto w-full">
            <span className="text-sm text-ink-soft">O teu total</span>
            <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
              {formatCurrency(myTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
