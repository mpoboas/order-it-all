import { describe, expect, it } from 'vitest';
import { filterExpensesByPeriod, computeGroupTotals } from './totals';
import type { Expense } from '@/lib/types';

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'e1',
    group_id: 'g1',
    kind: 'expense',
    description: 'Teste',
    amount: 10,
    date: '2026-07-15',
    split_mode: 'equal',
    payers: [{ party: 'u1', amount: 10 }],
    shares: [
      { party: 'u1', amount: 5 },
      { party: 'u2', amount: 5 },
    ],
    created_by: 'u1',
    created: '2026-07-15 10:00:00.000Z',
    updated: '2026-07-15 10:00:00.000Z',
    ...overrides,
  };
}

describe('filterExpensesByPeriod', () => {
  const now = new Date('2026-07-20T12:00:00Z');
  const thisMonth = makeExpense({ id: 'a', date: '2026-07-05' });
  const lastMonth = makeExpense({ id: 'b', date: '2026-06-28' });
  const deleted = makeExpense({ id: 'c', date: '2026-07-10', deleted_at: '2026-07-11' });
  const payment = makeExpense({ id: 'd', date: '2026-07-10', kind: 'payment' });
  const all = [thisMonth, lastMonth, deleted, payment];

  it('filtra "este mês" excluindo apagadas e pagamentos', () => {
    const result = filterExpensesByPeriod(all, 'this_month', now);
    expect(result.map((e) => e.id)).toEqual(['a']);
  });

  it('filtra "mês passado"', () => {
    const result = filterExpensesByPeriod(all, 'last_month', now);
    expect(result.map((e) => e.id)).toEqual(['b']);
  });

  it('"sempre" inclui tudo menos apagadas/pagamentos', () => {
    const result = filterExpensesByPeriod(all, 'all', now);
    expect(result.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});

describe('computeGroupTotals', () => {
  it('soma gasto do grupo, o que pagaste e a tua parte', () => {
    const expenses = [
      makeExpense({ amount: 10, payers: [{ party: 'u1', amount: 10 }], shares: [{ party: 'u1', amount: 5 }, { party: 'u2', amount: 5 }] }),
      makeExpense({ amount: 20, payers: [{ party: 'u2', amount: 20 }], shares: [{ party: 'u1', amount: 10 }, { party: 'u2', amount: 10 }] }),
    ];
    const totals = computeGroupTotals(expenses, 'u1', (id) => id);
    expect(totals.groupSpendCents).toBe(3000);
    expect(totals.youPaidCents).toBe(1000);
    expect(totals.yourShareCents).toBe(1500);
  });

  it('resolve placeholders reclamados através de `resolve`', () => {
    const expenses = [
      makeExpense({ amount: 10, payers: [{ party: 'placeholder1', amount: 10 }], shares: [{ party: 'placeholder1', amount: 10 }] }),
    ];
    const totals = computeGroupTotals(expenses, 'u1', () => 'u1');
    expect(totals.youPaidCents).toBe(1000);
    expect(totals.yourShareCents).toBe(1000);
  });
});
