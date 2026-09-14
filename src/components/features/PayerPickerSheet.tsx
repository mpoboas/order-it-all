'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PriceInput } from '@/components/ui/PriceInput';
import { Button } from '@/components/ui/Button';
import { formatEUR } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ExpensePayer, Party } from '@/lib/types';

interface PayerPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  totalAmount: number;
  payers: ExpensePayer[];
  onConfirm: (payers: ExpensePayer[]) => void;
}

const EPS = 0.005;

export function PayerPickerSheet({
  isOpen,
  onClose,
  parties,
  totalAmount,
  payers,
  onConfirm,
}: PayerPickerSheetProps) {
  const [multiple, setMultiple] = useState(payers.length > 1);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    setMultiple(payers.length > 1);
    setAmounts(Object.fromEntries(payers.map((p) => [p.party, p.amount])));
  }, [isOpen, payers]);

  const assigned = useMemo(
    () => parties.reduce((sum, p) => sum + (amounts[p.id] ?? 0), 0),
    [parties, amounts],
  );
  const remaining = totalAmount - assigned;
  const isValid = Math.abs(remaining) < EPS && assigned > EPS;

  const selectSingle = (partyId: string) => {
    onConfirm([{ party: partyId, amount: totalAmount }]);
    onClose();
  };

  const confirmMultiple = () => {
    const result = parties
      .map((p) => ({ party: p.id, amount: amounts[p.id] ?? 0 }))
      .filter((p) => p.amount > EPS);
    onConfirm(result);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Pago por"
      size={multiple ? 'large' : 'medium'}
      footer={
        multiple ? (
          <Button block disabled={!isValid} onClick={confirmMultiple}>
            Confirmar
          </Button>
        ) : undefined
      }
    >
      {!multiple ? (
        <div className="space-y-1">
          <ul>
            {parties.map((party) => (
              <li key={party.id}>
                <button
                  type="button"
                  onClick={() => selectSingle(party.id)}
                  className="w-full flex items-center gap-3 py-2.5 border-b border-hairline last:border-0 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors"
                >
                  <Avatar name={party.name} src={party.avatar} size="sm" />
                  <span className="flex-1 font-medium text-ink truncate">{party.name}</span>
                  {payers.length === 1 && payers[0].party === party.id && (
                    <Icon name="check" className="text-primary-600" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setMultiple(true)}
            className="mt-3 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            Várias pessoas
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setMultiple(false)}
            className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            ← Só uma pessoa
          </button>
          <ul className="divide-y divide-hairline">
            {parties.map((party) => (
              <li key={party.id} className="flex items-center gap-3 py-3">
                <Avatar name={party.name} src={party.avatar} size="sm" />
                <span className="flex-1 font-medium text-ink truncate">{party.name}</span>
                <PriceInput
                  value={amounts[party.id] ?? 0}
                  onValueChange={(v) => setAmounts((prev) => ({ ...prev, [party.id]: v }))}
                  className="w-24 text-right px-2 py-1.5 rounded-lg border border-hairline bg-surface-sunken focus:border-primary-500 outline-none"
                />
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-surface-sunken px-4 py-3">
            <p className={cn('text-sm font-semibold', isValid ? 'text-success-fg' : 'text-warning-fg')}>
              {isValid
                ? `${formatEUR(assigned)} atribuídos`
                : remaining > 0
                  ? `Faltam ${formatEUR(remaining)}`
                  : `${formatEUR(Math.abs(remaining))} a mais`}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
