import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lockBody, unlockBody } from './useBodyScrollLock';

const style: Record<string, string> = {};
const scrollTo = vi.fn();

beforeEach(() => {
  for (const k of ['position', 'top', 'left', 'right', 'width']) style[k] = '';
  scrollTo.mockClear();
  vi.stubGlobal('document', { body: { style } });
  vi.stubGlobal('window', { scrollY: 240, scrollTo });
});

describe('bloqueio de scroll com vários modais', () => {
  it('fixa o body e repõe tudo (e a posição) ao fechar', () => {
    lockBody();
    expect(style.position).toBe('fixed');
    expect(style.top).toBe('-240px');
    unlockBody();
    expect(style.position).toBe('');
    expect(style.top).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it('sheet + diálogo por cima, o sheet fecha primeiro: o body não fica preso', () => {
    lockBody(); // sheet
    lockBody(); // diálogo
    unlockBody(); // sheet fecha
    expect(style.position).toBe('fixed'); // o diálogo ainda está aberto
    unlockBody(); // diálogo fecha
    expect(style.position).toBe('');
    expect(style.top).toBe('');
  });

  it('desbloqueios a mais não estragam o estado seguinte', () => {
    unlockBody();
    lockBody();
    unlockBody();
    expect(style.position).toBe('');
  });
});
