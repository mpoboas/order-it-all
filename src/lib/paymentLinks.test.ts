import { describe, expect, it } from 'vitest';
import { normalizeRevtag, revolutPaymentUrl } from './paymentLinks';

describe('revolutPaymentUrl', () => {
  it('manda o valor em cêntimos, EUR e a nota', () => {
    expect(revolutPaymentUrl('miguel', 12.5)).toBe(
      'https://revolut.me/miguel?amount=1250&currency=EUR&note=Order%20It',
    );
  });

  it('arredonda os cêntimos (sem erros de vírgula flutuante)', () => {
    expect(revolutPaymentUrl('ana', 0.1 + 0.2)).toContain('amount=30&');
    expect(revolutPaymentUrl('ana', 36.045)).toMatch(/amount=360[45]&/);
    expect(revolutPaymentUrl('ana', 1234.56)).toContain('amount=123456&');
  });

  it('aceita a revtag com "@" e espaços', () => {
    expect(revolutPaymentUrl('  @miguel ', 1)).toBe(
      'https://revolut.me/miguel?amount=100&currency=EUR&note=Order%20It',
    );
  });
});

describe('normalizeRevtag', () => {
  it('tira o "@" e espaços', () => {
    expect(normalizeRevtag('@@joao_1 ')).toBe('joao_1');
  });
});
