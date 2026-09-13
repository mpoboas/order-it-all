import { describe, expect, it } from 'vitest';
import { fromCents, splitCents, toCents } from './money';

describe('toCents / fromCents', () => {
  it('converte euros ↔ cêntimos', () => {
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0)).toBe(0);
    expect(fromCents(1250)).toBe(12.5);
  });

  it('arredonda ao cêntimo mais próximo (evita erro de vírgula flutuante)', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('splitCents', () => {
  it('reparte 10€ por 3 pessoas — a soma bate sempre certo (maior resto)', () => {
    const parts = splitCents(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts.sort((a, b) => a - b)).toEqual([333, 333, 334]);
  });

  it('pesos proporcionais (percentagens/quotas)', () => {
    const parts = splitCents(1000, [70, 30]);
    expect(parts).toEqual([700, 300]);
  });

  it('pesos todos a zero cai para partes iguais', () => {
    const parts = splitCents(1000, [0, 0, 0]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(splitCents(1000, [])).toEqual([]);
  });

  it('total negativo (nunca deveria acontecer, mas não deve rebentar)', () => {
    const parts = splitCents(-100, [1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-100);
  });
});
