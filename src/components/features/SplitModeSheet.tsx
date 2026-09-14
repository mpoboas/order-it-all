'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { formatEUR } from '@/lib/money';
import { toCents } from '@/lib/ledger/money';
import { computeShares, type ComputableSplitMode } from '@/lib/ledger/shares';
import { cn } from '@/lib/utils';
import type { ExpenseSplitMode, Party } from '@/lib/types';

const MODE_LABELS: Record<ExpenseSplitMode, string> = {
  equal: 'Igual',
  exact: 'Exato',
  percentage: '%',
  shares: 'Quotas',
  adjustment: 'Ajuste',
  itemized: 'Itens',
};

const TABS: ExpenseSplitMode[] = ['equal', 'exact', 'percentage', 'shares', 'adjustment', 'itemized'];

export interface SplitModeResult {
  mode: ExpenseSplitMode;
  participantIds: string[];
  inputs: Record<string, number>;
}

interface SplitModeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  totalAmount: number;
  mode: ExpenseSplitMode;
  participantIds: string[];
  inputs: Record<string, number>;
  onConfirm: (result: SplitModeResult) => void;
  onOpenItems?: () => void;
  /** `false` esconde "Itens" — despesas diretas sem grupo (Fase 8) não têm
   *  onde viver um `Split` (o sub-sistema de itens é acoplado a grupo). */
  allowItemized?: boolean;
}

export function SplitModeSheet({
  isOpen,
  onClose,
  parties,
  totalAmount,
  mode: initialMode,
  participantIds: initialParticipantIds,
  inputs: initialInputs,
  onConfirm,
  onOpenItems,
  allowItemized = true,
}: SplitModeSheetProps) {
  const tabs = allowItemized ? TABS : TABS.filter((t) => t !== 'itemized');
  const [mode, setMode] = useState<ExpenseSplitMode>(initialMode);
  const [participantIds, setParticipantIds] = useState<string[]>(initialParticipantIds);
  const [inputs, setInputs] = useState<Record<string, number>>(initialInputs);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode === 'itemized' ? 'equal' : initialMode);
    setParticipantIds(initialParticipantIds.length ? initialParticipantIds : parties.map((p) => p.id));
    setInputs(initialInputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const amountCents = toCents(totalAmount);

  const computed = useMemo(() => {
    if (mode === 'itemized') return null;
    const ids = mode === 'equal' ? participantIds : parties.map((p) => p.id);
    return computeShares(mode as ComputableSplitMode, amountCents, ids, inputs);
  }, [mode, participantIds, parties, amountCents, inputs]);

  const toggleEqualParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const setInput = (id: string, raw: string) => {
    const parsed = raw === '' ? 0 : Number.parseFloat(raw.replace(',', '.'));
    setInputs((prev) => ({ ...prev, [id]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const canSave = mode === 'itemized' || (computed !== null && !computed.error);

  const handleSave = () => {
    if (mode === 'itemized') {
      onConfirm({ mode: 'itemized', participantIds, inputs });
      onOpenItems?.();
      onClose();
      return;
    }
    if (!computed || computed.error) return;
    const finalParticipantIds =
      mode === 'equal' ? participantIds : computed.shares.filter((s) => s.amountCents > 0).map((s) => s.party);
    onConfirm({ mode, participantIds: finalParticipantIds, inputs });
    onClose();
  };

  const suffixFor = (m: ExpenseSplitMode) =>
    m === 'exact' || m === 'adjustment' ? '€' : m === 'percentage' ? '%' : '';

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Como dividir"
      subtitle={formatEUR(totalAmount)}
      size="full"
      footer={
        <Button block disabled={!canSave} onClick={handleSave}>
          {mode === 'itemized' ? 'Continuar' : 'Confirmar'}
        </Button>
      }
    >
      <div className="space-y-4 px-1 pb-2">
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={cn(
                'shrink-0 px-3 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                mode === tab
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-ink-faint hover:text-ink',
              )}
            >
              {MODE_LABELS[tab]}
            </button>
          ))}
        </div>

        {mode === 'itemized' ? (
          <p className="text-sm text-ink-soft px-1 py-6 text-center">
            Vais poder atribuir cada item a quem participou depois de guardar.
          </p>
        ) : mode === 'equal' ? (
          <ul className="divide-y divide-hairline">
            {parties.map((party) => {
              const checked = participantIds.includes(party.id);
              return (
                <li key={party.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={party.name} src={party.avatar} size="sm" />
                  <span className="flex-1 font-medium text-ink truncate">{party.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleEqualParticipant(party.id)}
                    className={cn(
                      'w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-colors',
                      checked ? 'bg-primary-600 border-primary-600 text-white' : 'border-hairline bg-app',
                    )}
                    aria-pressed={checked}
                  >
                    {checked && <Icon name="check" className="text-lg" strokeWidth={3} />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y divide-hairline">
            {parties.map((party) => {
              const value = inputs[party.id] ?? 0;
              return (
                <li key={party.id} className="flex items-center gap-3 py-3">
                  <Avatar name={party.name} src={party.avatar} size="sm" />
                  <span className="flex-1 font-medium text-ink truncate">{party.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={mode === 'percentage' || mode === 'shares' ? 1 : 0.01}
                      value={value === 0 ? '' : value}
                      onChange={(e) => setInput(party.id, e.target.value)}
                      placeholder="0"
                      className="w-20 text-right text-base font-semibold bg-transparent border-b-2 border-hairline focus:border-primary-500 outline-none py-1"
                    />
                    {suffixFor(mode) && <span className="text-sm text-ink-faint">{suffixFor(mode)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {computed && (
          <div className="rounded-xl bg-surface-sunken px-4 py-3">
            <p className={cn('text-sm font-semibold', computed.error ? 'text-warning-fg' : 'text-success-fg')}>
              {computed.error ?? 'Divisão válida'}
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
