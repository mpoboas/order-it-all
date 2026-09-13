import { describe, expect, it } from 'vitest';
import { computeShares, sharesFromEuroTotals } from './shares';

describe('computeShares — equal', () => {
  it('divide 10€ por 3 pessoas sem perder cêntimos', () => {
    const { shares, error } = computeShares('equal', 1000, ['a', 'b', 'c']);
    expect(error).toBeUndefined();
    expect(shares.reduce((s, x) => s + x.amountCents, 0)).toBe(1000);
  });
});

describe('computeShares — exact', () => {
  it('aceita quando os valores somam ao total', () => {
    const { shares, error } = computeShares('exact', 1000, ['a', 'b'], { a: 6, b: 4 });
    expect(error).toBeUndefined();
    expect(shares).toEqual([
      { party: 'a', amountCents: 600, input: 6 },
      { party: 'b', amountCents: 400, input: 4 },
    ]);
  });

  it('rejeita quando não somam ao total', () => {
    const { error } = computeShares('exact', 1000, ['a', 'b'], { a: 6, b: 3 });
    expect(error).toMatch(/somar ao total/);
  });
});

describe('computeShares — percentage', () => {
  it('100% dividido certo', () => {
    const { shares, error } = computeShares('percentage', 1000, ['a', 'b'], { a: 30, b: 70 });
    expect(error).toBeUndefined();
    expect(shares.reduce((s, x) => s + x.amountCents, 0)).toBe(1000);
  });

  it('rejeita quando não soma 100%', () => {
    const { error } = computeShares('percentage', 1000, ['a', 'b'], { a: 30, b: 30 });
    expect(error).toMatch(/100 %/);
  });
});

describe('computeShares — shares (quotas)', () => {
  it('reparte por quotas (2:1)', () => {
    const { shares, error } = computeShares('shares', 900, ['a', 'b'], { a: 2, b: 1 });
    expect(error).toBeUndefined();
    expect(shares).toEqual([
      { party: 'a', amountCents: 600, input: 2 },
      { party: 'b', amountCents: 300, input: 1 },
    ]);
  });

  it('rejeita quando nenhuma quota é atribuída', () => {
    const { error } = computeShares('shares', 900, ['a', 'b'], {});
    expect(error).toMatch(/quota/);
  });
});

describe('computeShares — adjustment', () => {
  it('dá o ajuste a uma pessoa e reparte o resto igualmente', () => {
    // Total 100€, A recebe +40€ de ajuste, resto (60€) dividido por 3 = 20€ cada.
    const { shares, error } = computeShares('adjustment', 10000, ['a', 'b', 'c'], { a: 40 });
    expect(error).toBeUndefined();
    const byParty = Object.fromEntries(shares.map((s) => [s.party, s.amountCents]));
    expect(byParty.a).toBe(6000); // 20€ base + 40€ ajuste
    expect(byParty.b).toBe(2000);
    expect(byParty.c).toBe(2000);
    expect(shares.reduce((s, x) => s + x.amountCents, 0)).toBe(10000);
  });

  it('rejeita ajustes que ultrapassam o total', () => {
    const { error } = computeShares('adjustment', 1000, ['a', 'b'], { a: 20 });
    expect(error).toMatch(/não podem ultrapassar/);
  });
});

describe('sharesFromEuroTotals', () => {
  it('converte totais em euros (modo itemizado) para cêntimos, ignorando zeros', () => {
    const shares = sharesFromEuroTotals({ a: 12.5, b: 0, c: 7.5 });
    expect(shares).toEqual([
      { party: 'a', amountCents: 1250 },
      { party: 'c', amountCents: 750 },
    ]);
  });
});
