import { describe, expect, it } from 'vitest';
import type { Expense, Party } from '@/lib/types';
import { balanceOverview, computePeopleBalances, type PeopleGroupScope } from './people';

function expense(partial: Partial<Expense>): Expense {
  return {
    id: 'e' + Math.random(),
    group_id: 'g1',
    kind: 'expense',
    description: 'teste',
    amount: 0,
    date: '2026-10-01',
    split_mode: 'equal',
    payers: [],
    shares: [],
    created_by: 'me',
    created: '2026-10-01',
    updated: '2026-10-01',
    ...partial,
  };
}

/** `payer` pagou `amount` inteiro por `debtor`. */
const paidFor = (payer: string, debtor: string, amount: number, extra: Partial<Expense> = {}) =>
  expense({ amount, payers: [{ party: payer, amount }], shares: [{ party: debtor, amount }], ...extra });

const user = (id: string): Party => ({ id, name: id.toUpperCase(), kind: 'user' });

function group(expenses: Expense[], simplify: boolean, extraParties: Party[] = []): PeopleGroupScope {
  const parties = new Map<string, Party>(
    [user('me'), user('ana'), user('bia'), ...extraParties].map((p) => [p.id, p]),
  );
  return {
    groupId: 'g1',
    groupName: 'Berlim',
    simplify,
    expenses,
    parties,
    resolve: (id) => parties.get(id)?.claimedBy ?? id,
  };
}

const run = (groups: PeopleGroupScope[], directExpenses: Expense[] = [], friendIds: string[] = []) =>
  computePeopleBalances({ currentUserId: 'me', groups, directExpenses, partyForUser: user, friendIds });

// Berlim: a Ana pagou 10€ por mim, a Bia pagou 10€ pela Ana. A sugestão
// simplificada foi "tu pagas 10€ à Bia" — e eu paguei. O grupo está acertado.
const berlim = [
  paidFor('ana', 'me', 10),
  paidFor('bia', 'ana', 10),
  paidFor('me', 'bia', 10, { kind: 'payment' }),
];

describe('computePeopleBalances', () => {
  it('grupo acertado pelas sugestões simplificadas fica a zero com toda a gente', () => {
    const result = run([group(berlim, true)]);
    expect(result.people).toEqual([]);
    expect(balanceOverview(result)).toEqual({ receiveCents: 0, payCents: 0, netCents: 0 });
  });

  it('sem simplificação mostra as dívidas cruzadas (o comportamento do ecrã de Saldos nesse modo)', () => {
    const result = run([group(berlim, false)]);
    const byId = Object.fromEntries(result.people.map((p) => [p.userId, p.netCents]));
    expect(byId).toEqual({ ana: -1000, bia: 1000 });
    expect(balanceOverview(result)).toEqual({ receiveCents: 1000, payCents: 1000, netCents: 0 });
  });

  it('com simplificação pode dever-se a quem nunca se partilhou nada, marcado como simplificado', () => {
    // Antes de eu pagar: devo 10€ à Bia sem nunca ter tido uma despesa com ela.
    const result = run([group(berlim.slice(0, 2), true)]);
    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({
      userId: 'bia',
      netCents: -1000,
      groups: [{ groupId: 'g1', groupName: 'Berlim', netCents: -1000, simplified: true }],
    });
  });

  it('dívida simplificada para um membro sem conta conta no resumo, fora da lista de amigos', () => {
    const joao: Party = { id: 'ph_joao', name: 'João', kind: 'placeholder' };
    const result = run([group([paidFor('ph_joao', 'me', 20)], true, [joao])]);
    expect(result.people).toEqual([]);
    expect(result.placeholders).toEqual([{ groupId: 'g1', party: joao, amountCents: -2000 }]);
    expect(balanceOverview(result)).toEqual({ receiveCents: 0, payCents: 2000, netCents: -2000 });
  });

  it('despesas diretas somam-se ao saldo do grupo e nunca se simplificam', () => {
    const direct = [paidFor('me', 'ana', 5, { group_id: '', participants: ['me', 'ana'] })];
    const result = run([group(berlim.slice(0, 1), true)], direct);
    expect(result.people).toEqual([
      expect.objectContaining({ userId: 'ana', netCents: -500, directNetCents: 500 }),
    ]);
  });

  it('amigos sem despesas entram com saldo zero', () => {
    const result = run([], [], ['bia']);
    expect(result.people).toEqual([expect.objectContaining({ userId: 'bia', netCents: 0, groups: [] })]);
  });
});
