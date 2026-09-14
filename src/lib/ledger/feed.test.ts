import { describe, expect, it } from 'vitest';
import type { Expense } from '@/lib/types';
import { activityVerb, buildActivityFeed } from './feed';

function expense(partial: Partial<Expense>): Expense {
  return {
    id: 'e1',
    group_id: 'g1',
    kind: 'expense',
    description: 'teste',
    amount: 10,
    date: '2026-01-01',
    split_mode: 'equal',
    payers: [],
    shares: [],
    created_by: 'a',
    created: '2026-01-01T10:00:00.000Z',
    updated: '2026-01-01T10:00:00.000Z',
    ...partial,
  };
}

describe('activityVerb', () => {
  it('classifica como "added" quando updated ≈ created', () => {
    expect(activityVerb(expense({}))).toBe('added');
  });

  it('classifica como "updated" quando updated é bem depois de created', () => {
    expect(
      activityVerb(expense({ updated: '2026-01-01T10:05:00.000Z', updated_by: 'b' })),
    ).toBe('updated');
  });

  it('classifica como "deleted" quando tem deleted_at', () => {
    expect(activityVerb(expense({ deleted_at: '2026-01-02T00:00:00.000Z' }))).toBe('deleted');
  });

  it('um pagamento é sempre "payment", mesmo editado', () => {
    expect(
      activityVerb(expense({ kind: 'payment', updated: '2026-01-01T11:00:00.000Z' })),
    ).toBe('payment');
  });
});

describe('buildActivityFeed', () => {
  it('ordena por data mais recente primeiro', () => {
    const older = expense({ id: 'e1', updated: '2026-01-01T10:00:00.000Z' });
    const newer = expense({ id: 'e2', updated: '2026-01-02T10:00:00.000Z' });
    const feed = buildActivityFeed([older, newer]);
    expect(feed.map((i) => i.expense.id)).toEqual(['e2', 'e1']);
  });
});
