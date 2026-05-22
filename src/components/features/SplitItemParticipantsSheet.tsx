'use client';

import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import type { SplitItem } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';

interface SplitItemParticipantsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: SplitItem | null;
  allParticipants: string[];
  myName: string;
}

export function SplitItemParticipantsSheet({
  isOpen,
  onClose,
  item,
  allParticipants,
  myName,
}: SplitItemParticipantsSheetProps) {
  if (!item) return null;

  const selected = new Set(item.participants);
  const perPerson =
    item.participants.length > 0 ? item.price / item.participants.length : 0;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={item.name || 'Item'}
      subtitle={formatCurrency(item.price)}
      size="medium"
      minimizedAboveBottomNav={false}
    >
      <div className="space-y-4 px-1 pb-2">
        {item.participants.length > 0 ? (
          <div className="flex items-center justify-between rounded-xl bg-violet-50 dark:bg-violet-900/20 px-3 py-2.5">
            <span className="text-sm text-[var(--text-secondary)]">Por pessoa</span>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-bold text-violet-600 dark:text-violet-400">
                {formatCurrency(perPerson)}
              </span>
              <span className="text-[10px] font-medium text-[var(--text-muted)]">
                /pessoa
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)] text-center py-2">
            Ninguém está a dividir este item.
          </p>
        )}

        <ul className="space-y-2">
          {allParticipants.map((name) => {
            const isSelected = selected.has(name);
            const isMe = name === myName;
            return (
              <li
                key={name}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border',
                  isSelected
                    ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800'
                    : 'bg-[var(--bg-secondary)] border-[var(--border)] opacity-60'
                )}
              >
                <Avatar name={name} size="sm" />
                <span className="flex-1 font-medium text-[var(--text-primary)]">
                  {name}
                  {isMe && (
                    <span className="text-xs font-normal text-[var(--text-muted)] ml-1">
                      (tu)
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold',
                    isSelected
                      ? 'text-violet-600 dark:text-violet-400'
                      : 'text-[var(--text-muted)]'
                  )}
                >
                  {isSelected ? 'A dividir' : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
