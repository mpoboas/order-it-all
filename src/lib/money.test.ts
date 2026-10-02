import { describe, expect, it } from 'vitest';
import { formatEUR, formatEURParts } from './money';

describe('formatEURParts', () => {
  it('separa o número do símbolo', () => {
    expect(formatEURParts(21.5)).toEqual({ number: '21,50', symbol: '€' });
  });

  it('bate certo com formatEUR (número + espaço + símbolo)', () => {
    for (const v of [0, 0.33, 1234.5, 12345.67, -36.04, 1_000_000]) {
      const { number, symbol } = formatEURParts(v);
      expect(formatEUR(v).replace(/\s/g, ' ')).toBe(`${number} ${symbol}`.replace(/\s/g, ' '));
    }
  });

  it('mantém o sinal negativo no número', () => {
    expect(formatEURParts(-36.04).number.replace(/\s/g, ' ')).toMatch(/^-36,04$/);
  });

  it('valores inválidos dão 0,00', () => {
    expect(formatEURParts(Number.NaN)).toEqual({ number: '0,00', symbol: '€' });
  });
});
