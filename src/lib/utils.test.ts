import { describe, expect, it } from 'vitest';
import { maskSecret } from './utils';

describe('maskSecret', () => {
  it('mostra só os últimos 4 caracteres', () => {
    expect(maskSecret('AIzaSyCQzwilws2Qvq3zXWHq')).toBe('•••• XWHq');
  });

  it('não expõe nada de segredos curtos', () => {
    expect(maskSecret('abcd')).toBe('••••');
    expect(maskSecret('ab')).toBe('••••');
  });

  it('segredo vazio fica vazio (a linha mostra o placeholder)', () => {
    expect(maskSecret('')).toBe('');
  });
});
