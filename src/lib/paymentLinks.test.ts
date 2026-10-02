import { describe, expect, it } from 'vitest';
import { normalizeRevtag, revolutPaymentUrl, settleUpNote } from './paymentLinks';

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

describe('nota do Revolut', () => {
  it('leva o nome do grupo, codificado no URL', () => {
    expect(revolutPaymentUrl('ana', 5, settleUpNote('Casa de férias'))).toBe(
      'https://revolut.me/ana?amount=500&currency=EUR&note=Saldar%20d%C3%ADvida%20de%20%22Casa%20de%20f%C3%A9rias%22',
    );
  });

  it('sem grupo (entre amigos) fica só "Saldar dívida"', () => {
    expect(settleUpNote(undefined)).toBe('Saldar dívida');
    expect(settleUpNote('  ')).toBe('Saldar dívida');
  });
});

describe('normalizeRevtag', () => {
  it('tira o "@" e espaços', () => {
    expect(normalizeRevtag('@@joao_1 ')).toBe('joao_1');
  });
});
