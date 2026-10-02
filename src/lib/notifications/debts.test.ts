import { describe, expect, it } from 'vitest';
import type { Expense } from '@/lib/types';
import { staleDebtReminders, type LedgerScope } from './debts';

const NOW = new Date('2026-10-01T09:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let n = 0;
const exp = (created: string, payer: string, shares: [string, number][], extra: Partial<Expense> = {}): Expense =>
  ({
    id: `e${++n}`,
    kind: 'expense',
    description: 'x',
    amount: shares.reduce((s, [, a]) => s + a, 0),
    payers: [{ party: payer, amount: shares.reduce((s, [, a]) => s + a, 0) }],
    shares: shares.map(([party, amount]) => ({ party, amount })),
    created,
    ...extra,
  }) as unknown as Expense;

const NAMES: Record<string, string> = { ana: 'Ana', rui: 'Rui', eva: 'Eva', ph: 'João' };
const scope = (expenses: Expense[], extra: Partial<LedgerScope> = {}): LedgerScope => ({
  groupId: 'g1',
  name: 'Casa de férias',
  simplify: false,
  expenses,
  resolve: (id) => id,
  userOf: (id) => (id === 'ph' ? null : id),
  partyName: (id) => NAMES[id],
  ...extra,
});

describe('lembrete mensal de dívidas', () => {
  it('lembra só quem deve há mais de 15 dias, com o valor e para quem', () => {
    const out = staleDebtReminders([scope([exp(daysAgo(20), 'ana', [['ana', 10], ['rui', 23.4]])])], NOW);
    expect(out).toEqual([
      {
        userId: 'rui',
        title: '💸 Casa de férias',
        body: expect.stringMatching(/^Tens 23,40\s€ por acertar com Ana\. Quando der, acerta na app\.$/),
        url: '/groups/g1/expenses?abrir=acertar',
        tag: 'debt-reminder:g1',
      },
    ]);
  });

  it('dívida recente (menos de 15 dias) não conta', () => {
    expect(staleDebtReminders([scope([exp(daysAgo(3), 'ana', [['rui', 20]])])], NOW)).toEqual([]);
  });

  it('lembra o que está pendurado desde então, não o que acresceu depois', () => {
    const out = staleDebtReminders(
      [scope([exp(daysAgo(30), 'ana', [['rui', 10]]), exp(daysAgo(2), 'ana', [['rui', 50]])])],
      NOW,
    );
    expect(out[0].body).toMatch(/^Tens 10,00/);
  });

  it('se entretanto pagou, não há lembrete', () => {
    const out = staleDebtReminders(
      [
        scope([
          exp(daysAgo(30), 'ana', [['rui', 10]]),
          exp(daysAgo(5), 'rui', [['ana', 10]], { kind: 'payment' } as Partial<Expense>),
        ]),
      ],
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('menos de 1 € não merece aviso; pessoas sem conta não recebem', () => {
    expect(staleDebtReminders([scope([exp(daysAgo(30), 'ana', [['rui', 0.5]])])], NOW)).toEqual([]);
    expect(staleDebtReminders([scope([exp(daysAgo(30), 'ana', [['ph', 20]])])], NOW)).toEqual([]);
  });

  it('vários credores num só aviso por grupo', () => {
    const out = staleDebtReminders(
      [scope([exp(daysAgo(30), 'ana', [['rui', 10]]), exp(daysAgo(30), 'eva', [['rui', 5]])])],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].body).toMatch(/^Tens 15,00\s€ por acertar com (Ana e Eva|Eva e Ana)\./);
  });

  it('despesas diretas entre amigos: título com o nome do amigo', () => {
    const out = staleDebtReminders(
      [scope([exp(daysAgo(30), 'ana', [['rui', 8]])], { groupId: '', name: '' })],
      NOW,
    );
    expect(out[0]).toMatchObject({ title: '💸 Contas com Ana', url: '/people/ana' });
  });
});
