/**
 * Mensagens de erro dos ecrãs de autenticação, a partir do `ClientResponseError`
 * do PocketBase. Antes tudo dava "Email ou password incorretos" — incluindo
 * estar sem rede, o que mandava o utilizador pedir uma password nova à toa.
 */

interface PbLikeError {
  status?: number;
  isAbort?: boolean;
  response?: { data?: Record<string, { code?: string; message?: string }> };
}

export type AuthAction = 'login' | 'register' | 'reset-request' | 'reset-confirm';

const NETWORK = 'Sem ligação ao servidor. Verifica a internet e tenta outra vez.';

export function isNetworkError(err: unknown): boolean {
  const e = err as PbLikeError | null;
  return !e || e.isAbort === true || e.status === 0 || e.status === undefined;
}

/** Código de validação de um campo (ex.: `validation_not_unique` no email). */
export function fieldErrorCode(err: unknown, field: string): string | undefined {
  return (err as PbLikeError | null)?.response?.data?.[field]?.code;
}

export function authErrorMessage(err: unknown, action: AuthAction): string {
  if (isNetworkError(err)) return NETWORK;
  const e = err as PbLikeError;
  if (e.status === 429) return 'Demasiadas tentativas. Espera um pouco e tenta outra vez.';

  switch (action) {
    case 'login':
      return 'Email ou password incorretos.';
    case 'register':
      if (fieldErrorCode(err, 'email') === 'validation_not_unique') {
        return 'Já existe uma conta com este email.';
      }
      if (fieldErrorCode(err, 'email')) return 'Este email não é válido.';
      if (fieldErrorCode(err, 'password')) return 'A password deve ter pelo menos 8 caracteres.';
      return 'Não foi possível criar a conta. Tenta outra vez.';
    case 'reset-request':
      return 'Não foi possível enviar o email. Tenta outra vez.';
    case 'reset-confirm':
      if (fieldErrorCode(err, 'token')) {
        return 'Este link já expirou ou já foi usado. Pede um novo.';
      }
      if (fieldErrorCode(err, 'password')) return 'A password deve ter pelo menos 8 caracteres.';
      return 'Não foi possível alterar a password. Tenta outra vez.';
  }
}

/** Email guardado no token de reposição de password do PocketBase (JWT com
 *  `email` no payload) — para entrar logo a seguir sem o pedir outra vez. */
export function emailFromResetToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const email = (JSON.parse(json) as { email?: unknown }).email;
    return typeof email === 'string' && email.includes('@') ? email : null;
  } catch {
    return null;
  }
}
