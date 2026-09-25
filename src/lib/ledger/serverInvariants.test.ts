import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// O módulo vive em `pb/hooks/` (corre no JSVM do PocketBase, CommonJS) — aqui
// testa-se a lógica pura com `lookup`s falsos.
const require = createRequire(import.meta.url);
const inv = require(path.resolve(import.meta.dirname, '../../../pb/hooks/ledger_invariants.js'));

const ME = 'user00000000001';
const FRIEND = 'user00000000002';
const STRANGER = 'user00000000003';
const OTHER_MEMBER = 'user00000000004';
const PH = 'plch00000000001';
const G1 = 'grp000000000001';
const G2 = 'grp000000000002';

const members: Record<string, string[]> = { [G1]: [ME, OTHER_MEMBER], [G2]: [STRANGER] };
const lookup = {
  isGroupMember: (g: string, u: string) => (members[g] ?? []).includes(u),
  isGroupParty: (g: string, p: string) => (members[g] ?? []).includes(p) || (g === G1 && p === PH),
  areFriends: (a: string, b: string) => [a, b].sort().join() === [ME, FRIEND].sort().join(),
  haveDirectHistory: (a: string, b: string) => [a, b].sort().join() === [ME, STRANGER].sort().join(),
};

const expense = (over: Record<string, unknown> = {}) => ({
  group_id: G1,
  kind: 'expense',
  amount: 30,
  split_mode: 'equal',
  payers: [{ party: ME, amount: 30 }],
  shares: [
    { party: ME, amount: 10 },
    { party: OTHER_MEMBER, amount: 10 },
    { party: PH, amount: 10 },
  ],
  participants: [ME, OTHER_MEMBER],
  ...over,
});
const create = { authId: ME, isCreate: true, groupChanged: false };
const update = (previousParties: string[] = [], groupChanged = false) => ({
  authId: ME,
  isCreate: false,
  groupChanged,
  previousParties,
});

describe('checkSums', () => {
  it('aceita pagadores = partes = total, com dízimas em cêntimos', () => {
    expect(() =>
      inv.checkSums({
        amount: 10,
        split_mode: 'equal',
        payers: [{ party: 'a', amount: 3.33 }, { party: 'b', amount: 6.67 }],
        shares: [{ party: 'a', amount: 3.34 }, { party: 'b', amount: 3.33 }, { party: 'c', amount: 3.33 }],
      }),
    ).not.toThrow();
  });

  it('não é enganado pela vírgula flutuante (0.1 + 0.2)', () => {
    expect(() =>
      inv.checkSums({
        amount: 0.3,
        split_mode: 'exact',
        payers: [{ party: 'a', amount: 0.1 }, { party: 'b', amount: 0.2 }],
        shares: [{ party: 'a', amount: 0.3 }],
      }),
    ).not.toThrow();
  });

  it('rejeita Σ pagadores ≠ total', () => {
    expect(() => inv.checkSums(expense({ payers: [{ party: ME, amount: 20 }, { party: PH, amount: 5 }] }))).toThrow(
      /pagadores somam 25,00 € mas o total é 30,00 €/,
    );
  });

  it('rejeita Σ partes ≠ total (falta 1 cêntimo)', () => {
    expect(() =>
      inv.checkSums(expense({ shares: [{ party: ME, amount: 15 }, { party: PH, amount: 14.99 }] })),
    ).toThrow(/divisão soma 29,99 €/);
  });

  it('aceita "Falta pagador" e itemizada ainda sem partes', () => {
    expect(() => inv.checkSums(expense({ payers: [] }))).not.toThrow();
    expect(() => inv.checkSums(expense({ split_mode: 'itemized', shares: [] }))).not.toThrow();
  });

  it('rejeita despesa sem partes fora do modo itemizado', () => {
    expect(() => inv.checkSums(expense({ shares: [] }))).toThrow(/dividida por alguém/);
  });

  it('rejeita total ≤ 0, valores negativos e linhas sem pessoa', () => {
    expect(() => inv.checkSums(expense({ amount: 0 }))).toThrow(/maior que zero/);
    expect(() =>
      inv.checkSums(expense({ payers: [{ party: ME, amount: 40 }, { party: PH, amount: -10 }] })),
    ).toThrow(/valor inválido/);
    expect(() => inv.checkSums(expense({ payers: [{ amount: 30 }] }))).toThrow(/sem pessoa/);
  });

  it('pagamento tem exatamente um pagador e um recetor', () => {
    expect(() =>
      inv.checkSums({ kind: 'payment', amount: 5, split_mode: 'equal', payers: [{ party: 'a', amount: 5 }], shares: [{ party: 'b', amount: 5 }] }),
    ).not.toThrow();
    expect(() =>
      inv.checkSums({
        kind: 'payment',
        amount: 5,
        split_mode: 'equal',
        payers: [{ party: 'a', amount: 5 }],
        shares: [{ party: 'b', amount: 2.5 }, { party: 'c', amount: 2.5 }],
      }),
    ).toThrow(/um pagador e um recetor/);
  });
});

describe('validateExpense — limites de grupo', () => {
  it('aceita despesa de grupo com membros e placeholders do grupo', () => {
    expect(() => inv.validateExpense(expense(), create, lookup)).not.toThrow();
  });

  it('rejeita criar num grupo de que não se é membro', () => {
    expect(() => inv.validateExpense(expense({ group_id: G2, shares: [{ party: STRANGER, amount: 30 }], payers: [] }), create, lookup)).toThrow(
      /Não és membro/,
    );
  });

  it('rejeita mover a despesa para um grupo alheio', () => {
    expect(() => inv.validateExpense(expense({ group_id: G2 }), update([ME, OTHER_MEMBER, PH], true), lookup)).toThrow(
      /Não és membro/,
    );
  });

  it('rejeita meter partes de fora do grupo', () => {
    expect(() =>
      inv.validateExpense(expense({ shares: [{ party: ME, amount: 15 }, { party: STRANGER, amount: 15 }] }), create, lookup),
    ).toThrow(/não pertencem ao grupo/);
  });

  it('não bloqueia editar histórico de quem já saiu do grupo', () => {
    const LEFT = 'user00000000009';
    const e = expense({ payers: [{ party: LEFT, amount: 30 }], amount: 30 });
    expect(() => inv.validateExpense(e, update([LEFT, ME, OTHER_MEMBER, PH]), lookup)).not.toThrow();
  });
});

describe('validateExpense — despesas diretas', () => {
  const direct = (other: string, over: Record<string, unknown> = {}) =>
    expense({
      group_id: '',
      payers: [{ party: ME, amount: 30 }],
      shares: [{ party: ME, amount: 15 }, { party: other, amount: 15 }],
      participants: [ME, other],
      ...over,
    });

  it('aceita entre amigos', () => {
    expect(() => inv.validateExpense(direct(FRIEND), create, lookup)).not.toThrow();
  });

  it('rejeita com quem não é amigo', () => {
    expect(() => inv.validateExpense(direct(STRANGER), create, lookup)).toThrow(/com amigos/);
  });

  it('aceita pagamento a ex-amigo com histórico direto (acertar contas)', () => {
    const payment = direct(STRANGER, {
      kind: 'payment',
      amount: 15,
      payers: [{ party: ME, amount: 15 }],
      shares: [{ party: STRANGER, amount: 15 }],
    });
    expect(() => inv.validateExpense(payment, create, lookup)).not.toThrow();
  });

  it('rejeita partes que não são participantes', () => {
    expect(() =>
      inv.validateExpense(direct(FRIEND, { shares: [{ party: ME, amount: 15 }, { party: STRANGER, amount: 15 }] }), create, lookup),
    ).toThrow(/participantes/);
  });

  it('rejeita criar uma despesa direta da qual não se faz parte', () => {
    expect(() =>
      inv.validateExpense(
        direct(FRIEND, { participants: [FRIEND, STRANGER], payers: [{ party: FRIEND, amount: 30 }], shares: [{ party: FRIEND, amount: 15 }, { party: STRANGER, amount: 15 }] }),
        create,
        lookup,
      ),
    ).toThrow(/fazer parte/);
  });

  it('editar uma direta depois de desfazer a amizade continua possível', () => {
    expect(() => inv.validateExpense(direct(STRANGER), update([ME, STRANGER]), lookup)).not.toThrow();
  });
});

describe('checkSameGroup', () => {
  it('só deixa mover dentro do mesmo grupo', () => {
    expect(() => inv.checkSameGroup(G1, G1, 'o item')).not.toThrow();
    expect(() => inv.checkSameGroup(G1, G2, 'o item')).toThrow(/mover o item para outro grupo/);
  });
});
