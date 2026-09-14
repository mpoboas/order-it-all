import type { Expense } from '@/lib/types';
import { toCents } from './money';

export type TotalsPeriod = 'this_month' | 'last_month' | 'all';

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Filtra despesas (não pagamentos, não apagadas) por período — "este mês"/
 *  "mês passado" comparam a `date` da despesa (não `created`) com o mês
 *  corrente do relógio local. */
export function filterExpensesByPeriod(
  expenses: Expense[],
  period: TotalsPeriod,
  now: Date = new Date(),
): Expense[] {
  const active = expenses.filter((e) => !e.deleted_at && e.kind !== 'payment');
  if (period === 'all') return active;

  const target = new Date(now);
  if (period === 'last_month') target.setUTCMonth(target.getUTCMonth() - 1);
  const targetKey = monthKey(target);

  return active.filter((e) => monthKey(new Date(e.date)) === targetKey);
}

export interface GroupTotals {
  /** Soma de todas as despesas do período, em cêntimos. */
  groupSpendCents: number;
  /** O que o utilizador pagou (como pagador), em cêntimos. */
  youPaidCents: number;
  /** A parte do utilizador nas despesas do período, em cêntimos. */
  yourShareCents: number;
}

/** Totais do grupo para um período — usado pelo sheet "Totais". */
export function computeGroupTotals(
  expenses: Expense[],
  userId: string,
  resolve: (partyId: string) => string,
): GroupTotals {
  let groupSpendCents = 0;
  let youPaidCents = 0;
  let yourShareCents = 0;

  for (const e of expenses) {
    groupSpendCents += toCents(e.amount);
    for (const p of e.payers) {
      if (resolve(p.party) === userId) youPaidCents += toCents(p.amount);
    }
    for (const s of e.shares) {
      if (resolve(s.party) === userId) yourShareCents += toCents(s.amount);
    }
  }

  return { groupSpendCents, youPaidCents, yourShareCents };
}
