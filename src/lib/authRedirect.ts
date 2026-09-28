/**
 * `?redirect=` dos ecrãs de autenticação — o destino a que o utilizador volta
 * depois de entrar (ex.: `/invite/abc?autoJoin=true`).
 *
 * Dois cuidados:
 * - **Codificar sempre** ao passar de ecrã em ecrã. Sem isso um `&` no destino
 *   partia o link (`?redirect=/x?a=1&b=2` → o `b` ia para o ecrã de auth).
 * - **Só caminhos internos.** O valor vem do URL (qualquer um pode fabricar um
 *   link); `//evil.com` ou `https://…` num `router.push` levavam o utilizador,
 *   já autenticado, para fora da app (open redirect).
 */

/** Devolve o destino se for um caminho interno da app, senão `null`. */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null;
  // Não voltar a um ecrã de auth depois de entrar (ciclo login → login).
  if (path === '/auth' || path.startsWith('/auth/')) return null;
  return path;
}

/** `path` com `?redirect=<destino codificado>` (ou só `path`, sem destino). */
export function withRedirect(path: string, redirect: string | null | undefined): string {
  const safe = safeRedirect(redirect);
  if (!safe) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}redirect=${encodeURIComponent(safe)}`;
}
