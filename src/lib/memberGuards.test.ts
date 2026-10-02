import { describe, expect, it } from 'vitest';
import type { Expense } from '@/lib/types';
import { placeholderRemovalBlock, userRemovalBlock } from './memberGuards';

const expense = (payers: [string, number][], shares: [string, number][], extra: Partial<Expense> = {}): Expense =>
    ({
        id: Math.random().toString(36).slice(2),
        kind: 'expense',
        payers: payers.map(([party, amount]) => ({ party, amount })),
        shares: shares.map(([party, amount]) => ({ party, amount })),
        ...extra,
    }) as unknown as Expense;

const base = { placeholders: [], trips: [], orders: [] };

describe('userRemovalBlock', () => {
    it('bloqueia quem ainda deve ou tem a receber', () => {
        const expenses = [expense([['ana', 30]], [['ana', 10], ['rui', 10], ['eva', 10]])];
        expect(userRemovalBlock({ ...base, userId: 'rui', expenses })).toEqual({ reason: 'balance', cents: -1000 });
        expect(userRemovalBlock({ ...base, userId: 'ana', expenses })).toEqual({ reason: 'balance', cents: 2000 });
    });

    it('deixa sair com o saldo a zero (acertado com um pagamento)', () => {
        const expenses = [
            expense([['ana', 20]], [['ana', 10], ['rui', 10]]),
            expense([['rui', 10]], [['ana', 10]], { kind: 'payment' } as Partial<Expense>),
        ];
        expect(userRemovalBlock({ ...base, userId: 'rui', expenses })).toBeNull();
    });

    it('ignora despesas apagadas', () => {
        const expenses = [expense([['ana', 20]], [['rui', 20]], { deleted_at: '2026-09-01' } as Partial<Expense>)];
        expect(userRemovalBlock({ ...base, userId: 'rui', expenses })).toBeNull();
    });

    it('o saldo de um placeholder reclamado conta como da pessoa', () => {
        const expenses = [expense([['ana', 10]], [['ph1', 10]])];
        const placeholders = [{ id: 'ph1', claimed_by: 'rui' }];
        expect(userRemovalBlock({ ...base, placeholders, userId: 'rui', expenses })).toEqual({ reason: 'balance', cents: -1000 });
    });

    it('bloqueia pedidos em viagens ainda abertas, não em fechadas', () => {
        const trips = [
            { id: 't1', status: 'open' as const },
            { id: 't2', status: 'closed' as const },
        ];
        expect(
            userRemovalBlock({ ...base, userId: 'rui', expenses: [], trips, orders: [{ trip_id: 't1', user: 'rui' }] }),
        ).toEqual({ reason: 'orders', count: 1 });
        expect(
            userRemovalBlock({ ...base, userId: 'rui', expenses: [], trips, orders: [{ trip_id: 't2', user: 'rui' }] }),
        ).toBeNull();
    });
});

describe('placeholderRemovalBlock', () => {
    it('bloqueia se aparecer numa despesa', () => {
        const expenses = [expense([['ana', 10]], [['ph1', 10]])];
        expect(placeholderRemovalBlock({ placeholderId: 'ph1', expenses, splits: [] })).toEqual({ reason: 'expenses', count: 1 });
    });

    it('bloqueia se estiver numa divisão aberta', () => {
        expect(
            placeholderRemovalBlock({ placeholderId: 'ph1', expenses: [], splits: [{ participants: ['ph1'], status: 'open' }] }),
        ).toEqual({ reason: 'splits', count: 1 });
    });

    it('deixa remover quem não aparece em lado nenhum', () => {
        expect(placeholderRemovalBlock({ placeholderId: 'ph1', expenses: [], splits: [] })).toBeNull();
    });
});
