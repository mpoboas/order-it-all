'use client';

import type { Expense, Party } from '@/lib/types';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/utils';
import {
  formatDayMonthAbbrev,
  myAmountForExpense,
  payerSummaryLabel,
  paymentSentence,
} from '@/lib/expenseDisplay';

interface ExpenseRowProps {
  expense: Expense;
  parties: Map<string, Party>;
  myId: string;
  onClick: () => void;
}

const EPS = 0.005;

export function ExpenseRow({ expense, parties, myId, onClick }: ExpenseRowProps) {
  const { day, month } = formatDayMonthAbbrev(expense.date);

  if (expense.kind === 'payment') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
      >
        <div className="w-8 flex flex-col items-center shrink-0">
          <span className="text-[10px] font-bold uppercase text-ink-faint">{month}</span>
          <span className="text-sm font-bold text-ink-soft leading-none">{day}</span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-success-bg text-success-fg flex items-center justify-center shrink-0">
          <Icon name="swap_horiz" />
        </div>
        <p className="flex-1 min-w-0 text-sm text-ink font-medium truncate">
          {paymentSentence(expense, parties, myId)}
        </p>
      </button>
    );
  }

  const myAmount = myAmountForExpense(expense, myId, parties);
  const hasPayer = expense.payers.length > 0;
  const subtitle = hasPayer ? payerSummaryLabel(expense, parties) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
    >
      <div className="w-8 flex flex-col items-center shrink-0">
        <span className="text-[10px] font-bold uppercase text-ink-faint">{month}</span>
        <span className="text-sm font-bold text-ink-soft leading-none">{day}</span>
      </div>

      <CategoryIcon category={expense.category} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-semibold text-ink truncate">
            {expense.description || 'Despesa sem nome'}
          </p>
          {expense.split_mode === 'itemized' && (
            <Icon name="chevron_right" className="text-sm text-ink-faint shrink-0" />
          )}
        </div>
        {!hasPayer ? (
          <Badge variant="warning" className="mt-1">Falta pagador</Badge>
        ) : subtitle ? (
          <p className="text-xs text-ink-soft truncate mt-0.5">{subtitle}</p>
        ) : null}
      </div>

      {hasPayer && myAmount !== null && (
        <div className="text-right shrink-0">
          <p
            className={cn(
              'text-[10px] font-bold uppercase tracking-wide',
              myAmount > EPS ? 'text-success-fg' : myAmount < -EPS ? 'text-warning-fg' : 'text-ink-faint',
            )}
          >
            {myAmount > EPS ? 'emprestaste' : myAmount < -EPS ? 'pediste' : 'em dia'}
          </p>
          {Math.abs(myAmount) > EPS && (
            <Money
              value={Math.abs(myAmount)}
              className={cn(
                'text-sm font-bold',
                myAmount > 0 ? 'text-success-fg' : 'text-warning-fg',
              )}
            />
          )}
        </div>
      )}
      {hasPayer && myAmount === null && (
        <p className="text-xs text-ink-faint shrink-0">não participaste</p>
      )}
    </button>
  );
}
