import { describe, expect, it } from 'vitest';
import type { Expense } from '@/lib/types';
import { computeGroupSummary, expenseMonths, monthLabel } from './summary';

let n = 0;
const exp = (
    amount: number,
    date: string,
    payers: [string, number][],
    shares: [string, number][],
    extra: Partial<Expense> = {},
): Expense =>
    ({
        id: `e${++n}`,
        kind: 'expense',
        description: `Despesa ${n}`,
        amount,
        date,
        category: 'food',
        created_by: payers[0][0],
        payers: payers.map(([party, a]) => ({ party, amount: a })),
        shares: shares.map(([party, a]) => ({ party, amount: a })),
        ...extra,
    }) as unknown as Expense;

const identity = (id: string) => id;
const NOW = new Date('2026-09-20T12:00:00Z');

describe('computeGroupSummary', () => {
    const expenses = [
        exp(30, '2026-09-02', [['ana', 30]], [['ana', 10], ['rui', 10], ['eva', 10]]),
        exp(60, '2026-09-05', [['ana', 60]], [['ana', 20], ['rui', 20], ['eva', 20]], { category: 'groceries', created_by: 'rui' }),
        exp(12, '2026-09-05', [['rui', 12]], [['rui', 6], ['eva', 6]]),
        exp(99, '2026-09-06', [['eva', 99]], [['ana', 99]], { kind: 'payment' } as Partial<Expense>),
        exp(50, '2026-08-10', [['eva', 50]], [['eva', 25], ['rui', 25]]),
    ];

    it('essencial: total, média por pessoa, a tua parte e o que pagaste (sem pagamentos)', () => {
        const s = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: '2026-09', now: NOW });
        expect(s.totalCents).toBe(10200);
        expect(s.expenseCount).toBe(3);
        expect(s.peopleCount).toBe(3);
        expect(s.perPersonCents).toBe(3400);
        expect(s.youPaidCents).toBe(1200);
        expect(s.yourShareCents).toBe(3600);
        expect(s.previousTotalCents).toBe(5000);
    });

    it('linha do tempo diária no mês, até hoje, com os dias sem gasto a zero', () => {
        const s = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: '2026-09', now: NOW });
        expect(s.timeline.granularity).toBe('day');
        expect(s.timeline.points).toHaveLength(20);
        expect(s.timeline.points[4]).toMatchObject({ label: '5', cents: 7200, fullLabel: '5 set.' });
        expect(s.timeline.points[0].cents).toBe(0);
        expect(s.perDayCents).toBe(510);
    });

    it('linha do tempo mensal quando o grupo dura mais de 2 meses', () => {
        const long = [...expenses, exp(10, '2026-03-01', [['ana', 10]], [['ana', 10]])];
        const s = computeGroupSummary({ expenses: long, resolve: identity, userId: 'rui', period: 'all', now: NOW });
        expect(s.timeline.granularity).toBe('month');
        expect(s.timeline.points.map((p) => p.label)).toEqual(['mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set']);
        expect(s.days).toBeNull();
    });

    it('categorias ordenadas, com a quota', () => {
        const s = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: '2026-09', now: NOW });
        expect(s.byCategory[0]).toMatchObject({ id: 'groceries', cents: 6000 });
        expect(s.awards.topCategory?.id).toBe('groceries');
        expect(s.awards.topCategory?.share).toBeCloseTo(6000 / 10200);
    });

    it('prémios: banco (quem mais adiantou), contabilista e despesa do ano', () => {
        const s = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: '2026-09', now: NOW });
        expect(s.awards.bank).toEqual({ party: 'ana', cents: 6000 });
        expect(s.awards.accountant).toEqual({ userId: 'rui', count: 2 });
        expect(s.awards.biggest).toMatchObject({ cents: 6000, payers: ['ana'] });
    });

    it('funde placeholders reclamados com a pessoa', () => {
        const resolve = (id: string) => (id === 'ph' ? 'rui' : id);
        const s = computeGroupSummary({
            expenses: [exp(20, '2026-09-03', [['ph', 20]], [['ana', 10], ['ph', 10]])],
            resolve,
            userId: 'rui',
            period: '2026-09',
            now: NOW,
        });
        expect(s.youPaidCents).toBe(2000);
        expect(s.byPerson.find((p) => p.party === 'rui')).toMatchObject({ paidCents: 2000, consumedCents: 1000 });
    });

    it('o clássico da lista: o produto mais pedido (≥2 vezes), com a grafia mais usada', () => {
        const orderItems = [
            { name: 'Leite', created: '2026-09-01' },
            { name: 'leite ', created: '2026-09-03' },
            { name: 'Leite', created: '2026-09-04' },
            { name: 'Pão', created: '2026-09-04' },
            { name: 'Pão', created: '2026-09-05' },
            { name: 'Cerveja', created: '2026-08-01' },
        ];
        const s = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: '2026-09', orderItems, now: NOW });
        expect(s.awards.classic).toEqual({ name: 'Leite', count: 3 });
        const none = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: 'all', orderItems: [{ name: 'Único', created: '2026-09-01' }], now: NOW });
        expect(none.awards.classic).toBeUndefined();
    });

    it('sem despesas: tudo a zero e sem prémios', () => {
        const s = computeGroupSummary({ expenses: [], resolve: identity, userId: 'rui', period: 'all', now: NOW });
        expect(s.totalCents).toBe(0);
        expect(s.timeline.points).toEqual([]);
        expect(s.awards.bank).toBeUndefined();
        expect(s.awards.biggest).toBeUndefined();
    });

    it('meses com despesas (sem pagamentos), por ordem, e o rótulo', () => {
        expect(expenseMonths(expenses)).toEqual(['2026-08', '2026-09']);
        expect(monthLabel('2026-09')).toBe('setembro 2026');
    });

    it('um mês passado mostra o mês inteiro e compara com o anterior', () => {
        const s = computeGroupSummary({ expenses, resolve: identity, userId: 'rui', period: '2026-08', now: NOW });
        expect(s.totalCents).toBe(5000);
        expect(s.timeline.points).toHaveLength(31);
        expect(s.previousTotalCents).toBe(0);
    });
});
