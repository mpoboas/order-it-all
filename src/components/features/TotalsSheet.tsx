'use client';

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/utils';
import { canonicalPartyId } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { filterExpensesByPeriod, computeGroupTotals, type TotalsPeriod } from '@/lib/ledger/totals';
import type { Expense, Party } from '@/lib/types';

interface TotalsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: Expense[];
  parties: Map<string, Party>;
  currentUserId: string;
}

const PERIODS: { id: TotalsPeriod; label: string }[] = [
  { id: 'this_month', label: 'Este mês' },
  { id: 'last_month', label: 'Mês passado' },
  { id: 'all', label: 'Sempre' },
];

export function TotalsSheet({ isOpen, onClose, expenses, parties, currentUserId }: TotalsSheetProps) {
  const [period, setPeriod] = useState<TotalsPeriod>('this_month');

  const totals = useMemo(() => {
    const filtered = filterExpensesByPeriod(expenses, period);
    return computeGroupTotals(filtered, currentUserId, (id) => canonicalPartyId(id, parties));
  }, [expenses, period, currentUserId, parties]);

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Totais" size="full">
      <div className="space-y-4">
        <div className="flex p-1 bg-surface-sunken rounded-xl">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                'flex-1 py-2 text-sm font-semibold rounded-lg transition-colors',
                period === p.id ? 'bg-surface text-primary-600 dark:text-primary-400 shadow-sm' : 'text-ink-soft',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Gasto do grupo" value={<Money value={fromCents(totals.groupSpendCents)} />} />
          <StatCard label="Pagaste" value={<Money value={fromCents(totals.youPaidCents)} />} />
          <StatCard label="A tua parte" value={<Money value={fromCents(totals.yourShareCents)} />} />
        </div>
      </div>
    </Sheet>
  );
}
