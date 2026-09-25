import { describe, expect, it } from 'vitest';
import type { Expense } from '@/lib/types';
import {
  balanceFor,
  netByParty,
  netPairwise,
  pairwiseDebts,
  simplifiedToPairwise,
  simplifyDebts,
} from './balances';

function expense(partial: Partial<Expense>): Expense {
  return {
    id: 'e' + Math.random(),
    group_id: 'g1',
    kind: 'expense',
    description: 'teste',
    amount: 0,
    date: '2026-01-01',
    split_mode: 'equal',
    payers: [],
    shares: [],
    created_by: 'a',
    created: '2026-01-01',
    updated: '2026-01-01',
    ...partial,
  };
}

describe('netByParty', () => {
  it('soma pagamentos e subtrai partes devidas', () => {
    // A pagou 30€, dividido igualmente por A, B, C (10€ cada).
    const e = expense({
      amount: 30,
      payers: [{ party: 'a', amount: 30 }],
      shares: [
        { party: 'a', amount: 10 },
        { party: 'b', amount: 10 },
        { party: 'c', amount: 10 },
      ],
    });
    const net = netByParty([e]);
    expect(net.a).toBe(2000); // pagou 30, deve 10 → +20
    expect(net.b).toBe(-1000);
    expect(net.c).toBe(-1000);
  });

  it('ignora despesas apagadas e sem pagador', () => {
    const deleted = expense({
      amount: 100,
      payers: [{ party: 'a', amount: 100 }],
      shares: [{ party: 'b', amount: 100 }],
      deleted_at: '2026-01-02',
    });
    const noPayer = expense({
      amount: 50,
      payers: [],
      shares: [{ party: 'b', amount: 50 }],
    });
    const net = netByParty([deleted, noPayer]);
    expect(net).toEqual({});
  });

  it('um pagamento (kind payment) zera a dívida', () => {
    const bill = expense({
      amount: 20,
      payers: [{ party: 'a', amount: 20 }],
      shares: [{ party: 'b', amount: 20 }],
    });
    const settlement = expense({
      kind: 'payment',
      amount: 20,
      payers: [{ party: 'b', amount: 20 }],
      shares: [{ party: 'a', amount: 20 }],
    });
    const net = netByParty([bill, settlement]);
    expect(net.a).toBe(0);
    expect(net.b).toBe(0);
  });

  it('funde o saldo de um placeholder reclamado com o utilizador que o reclamou', () => {
    const e = expense({
      amount: 20,
      payers: [{ party: 'user-1', amount: 20 }],
      shares: [{ party: 'placeholder-1', amount: 20 }],
    });
    const resolve = (id: string) => (id === 'placeholder-1' ? 'user-2' : id);
    const net = netByParty([e], resolve);
    expect(net['user-2']).toBe(-2000);
    expect(net['placeholder-1']).toBeUndefined();
  });
});

describe('pairwiseDebts + netPairwise', () => {
  it('devedor deve ao pagador o valor da sua parte', () => {
    const e = expense({
      amount: 30,
      payers: [{ party: 'a', amount: 30 }],
      shares: [
        { party: 'b', amount: 15 },
        { party: 'c', amount: 15 },
      ],
    });
    const pairwise = pairwiseDebts([e]);
    expect(pairwise.b.a).toBe(1500);
    expect(pairwise.c.a).toBe(1500);
  });

  it('compensa A→B e B→A num único par', () => {
    const ab = expense({
      amount: 10,
      payers: [{ party: 'a', amount: 10 }],
      shares: [{ party: 'b', amount: 10 }],
    });
    const ba = expense({
      amount: 6,
      payers: [{ party: 'b', amount: 6 }],
      shares: [{ party: 'a', amount: 6 }],
    });
    const pairwise = pairwiseDebts([ab, ba]);
    const net = netPairwise(pairwise);
    expect(net.b.a).toBe(400); // B ainda deve 4€ a A
    expect(net.a?.b).toBeUndefined();
  });
});

describe('simplifyDebts', () => {
  it('A deve a B, B deve a C ⇒ simplifica para A deve a C', () => {
    const ab = expense({
      amount: 20,
      payers: [{ party: 'b', amount: 20 }],
      shares: [{ party: 'a', amount: 20 }],
    });
    const bc = expense({
      amount: 20,
      payers: [{ party: 'c', amount: 20 }],
      shares: [{ party: 'b', amount: 20 }],
    });
    const net = netByParty([ab, bc]);
    // a deve 20 a b (net a = -2000); b pagou 20 e deve 20 → net 0; c pagou 20 → net +2000.
    expect(net.a).toBe(-2000);
    expect(net.b).toBe(0);
    expect(net.c).toBe(2000);

    const simplified = simplifyDebts(net);
    expect(simplified).toEqual([{ from: 'a', to: 'c', amountCents: 2000 }]);

    // O saldo líquido de ninguém muda com a simplificação.
    const totalBefore = Object.values(net).reduce((s, v) => s + v, 0);
    expect(totalBefore).toBe(0);
  });

  it('nunca inventa dinheiro — a soma dos simplificados bate com os créditos', () => {
    const net = { a: -3000, b: -2000, c: 5000 };
    const simplified = simplifyDebts(net);
    const totalToC = simplified.filter((s) => s.to === 'c').reduce((s, x) => s + x.amountCents, 0);
    expect(totalToC).toBe(5000);
  });
});

describe('balanceFor', () => {
  it('devolve linhas positivas para quem te deve e negativas para quem deves', () => {
    const pairwise = { b: { a: 1000 } }; // b deve 10€ a a
    const net = { a: 1000, b: -1000 };
    const balanceA = balanceFor('a', pairwise, net);
    expect(balanceA.netCents).toBe(1000);
    expect(balanceA.lines).toEqual([{ party: 'b', amountCents: 1000 }]);

    const balanceB = balanceFor('b', pairwise, net);
    expect(balanceB.lines).toEqual([{ party: 'a', amountCents: -1000 }]);
  });
});

describe('simplifiedToPairwise', () => {
  it('converte a lista simplificada para o formato debtor→credor', () => {
    const map = simplifiedToPairwise([{ from: 'a', to: 'c', amountCents: 2000 }]);
    expect(map.a.c).toBe(2000);
  });
});

describe('pairwiseDebts ↔ netByParty (vários pagadores)', () => {
  /** Saldo líquido de cada parte reconstruído a partir das dívidas por par. */
  function netFromPairwise(pw: Record<string, Record<string, number>>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [debtor, creditors] of Object.entries(pw)) {
      for (const [creditor, cents] of Object.entries(creditors)) {
        out[debtor] = (out[debtor] ?? 0) - cents;
        out[creditor] = (out[creditor] ?? 0) + cents;
      }
    }
    return out;
  }
  const nonZero = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== 0));

  it('caso real do QA: 2 pagadores, devedor também pagador — sem cêntimo fantasma', () => {
    const exp = [
      expense({
        amount: 27.53,
        payers: [{ party: 'A', amount: 20 }, { party: 'B', amount: 7.53 }],
        shares: [{ party: 'A', amount: 5.65 }, { party: 'B', amount: 16.23 }, { party: 'C', amount: 5.65 }],
      }),
    ];
    expect(nonZero(netFromPairwise(netPairwise(pairwiseDebts(exp))))).toEqual(nonZero(netByParty(exp)));
  });

  it('propriedade: 500 despesas aleatórias batem sempre ao cêntimo', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const people = ['A', 'B', 'C', 'D', 'E'];
    const splitRandom = (totalCents: number, parties: string[]) => {
      const cuts = parties.map(() => rnd() + 0.01);
      const sum = cuts.reduce((s, c) => s + c, 0);
      const cents = cuts.map((c) => Math.floor((c / sum) * totalCents));
      cents[0] += totalCents - cents.reduce((s, c) => s + c, 0);
      return parties.map((party, i) => ({ party, amount: cents[i] / 100 }));
    };
    for (let k = 0; k < 500; k++) {
      const totalCents = 1 + Math.floor(rnd() * 20000);
      const payers = people.filter(() => rnd() < 0.5);
      const sharers = people.filter(() => rnd() < 0.7);
      if (!payers.length || !sharers.length) continue;
      const exp = [expense({ amount: totalCents / 100, payers: splitRandom(totalCents, payers), shares: splitRandom(totalCents, sharers) })];
      expect(nonZero(netFromPairwise(netPairwise(pairwiseDebts(exp))))).toEqual(nonZero(netByParty(exp)));
    }
  });
});
