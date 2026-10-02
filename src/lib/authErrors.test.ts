import { describe, expect, it } from 'vitest';
import { authErrorMessage, emailFromResetToken } from './authErrors';

const pbError = (status: number, data: Record<string, { code: string }> = {}) => ({
  status,
  response: { data },
});

describe('authErrorMessage', () => {
  it('distingue falta de rede de credenciais erradas', () => {
    expect(authErrorMessage(pbError(0), 'login')).toMatch(/Sem ligação/);
    expect(authErrorMessage({ status: 0, isAbort: true }, 'login')).toMatch(/Sem ligação/);
    expect(authErrorMessage(pbError(400), 'login')).toBe('Email ou password incorretos.');
  });

  it('email já usado no registo', () => {
    expect(authErrorMessage(pbError(400, { email: { code: 'validation_not_unique' } }), 'register'))
      .toBe('Já existe uma conta com este email.');
  });

  it('token de reposição inválido', () => {
    expect(authErrorMessage(pbError(400, { token: { code: 'validation_invalid_token' } }), 'reset-confirm'))
      .toMatch(/expirou/);
  });

  it('limite de pedidos', () => {
    expect(authErrorMessage(pbError(429), 'reset-request')).toMatch(/Demasiadas/);
  });
});

describe('emailFromResetToken', () => {
  const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  it('lê o email do payload', () => {
    expect(emailFromResetToken(`h.${b64url({ email: 'ana@x.pt', type: 'passwordReset' })}.s`)).toBe('ana@x.pt');
  });

  it('token malformado → null', () => {
    expect(emailFromResetToken('lixo')).toBeNull();
    expect(emailFromResetToken('a.%%%.b')).toBeNull();
  });
});
