import { describe, expect, it } from 'vitest';
import { safeRedirect, withRedirect } from './authRedirect';

describe('safeRedirect', () => {
  it('aceita caminhos internos, com query', () => {
    expect(safeRedirect('/groups')).toBe('/groups');
    expect(safeRedirect('/invite/abc?autoJoin=true&x=1')).toBe('/invite/abc?autoJoin=true&x=1');
  });

  it('recusa destinos externos (open redirect)', () => {
    expect(safeRedirect('https://evil.com')).toBeNull();
    expect(safeRedirect('//evil.com/x')).toBeNull();
    expect(safeRedirect('/\\evil.com')).toBeNull();
    expect(safeRedirect('javascript:alert(1)')).toBeNull();
  });

  it('recusa vazio e ecrãs de auth', () => {
    expect(safeRedirect(null)).toBeNull();
    expect(safeRedirect('')).toBeNull();
    expect(safeRedirect('/auth/login')).toBeNull();
  });
});

describe('withRedirect', () => {
  it('codifica o destino (um "&" não parte o link)', () => {
    const url = withRedirect('/auth/login', '/invite/abc?autoJoin=true&x=1');
    expect(url).toBe('/auth/login?redirect=%2Finvite%2Fabc%3FautoJoin%3Dtrue%26x%3D1');
    expect(new URL(url, 'http://x').searchParams.get('redirect')).toBe('/invite/abc?autoJoin=true&x=1');
  });

  it('sobrevive a vários saltos (registo → perfil → onboarding)', () => {
    const dest = '/invite/abc?autoJoin=true&x=1';
    let url = withRedirect('/auth/register', dest);
    for (const next of ['/auth/profile-setup', '/onboarding']) {
      const got = new URL(url, 'http://x').searchParams.get('redirect');
      url = withRedirect(next, got);
    }
    expect(new URL(url, 'http://x').searchParams.get('redirect')).toBe(dest);
  });

  it('sem destino (ou inválido) devolve só o caminho', () => {
    expect(withRedirect('/auth/login', null)).toBe('/auth/login');
    expect(withRedirect('/auth/login', 'https://evil.com')).toBe('/auth/login');
  });
});
