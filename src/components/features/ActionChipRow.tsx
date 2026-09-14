'use client';

import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface Chip {
  icon: IconName;
  label: string;
  onClick: () => void;
}

interface ActionChipRowProps {
  chips: Chip[];
}

/** Fila de ações horizontal (scroll) por baixo da faixa de saldo — "Acertar
 *  contas", "Saldos", etc. */
export function ActionChipRow({ chips }: ActionChipRowProps) {
  if (chips.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2.5 border-b border-hairline bg-surface scrollbar-hide">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.onClick}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-hairline-strong',
            'text-sm font-semibold text-ink-soft bg-surface-sunken hover:bg-hairline/30 active:scale-95 transition',
          )}
        >
          <Icon name={chip.icon} className="text-base" />
          {chip.label}
        </button>
      ))}
    </div>
  );
}
