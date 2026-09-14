/**
 * Navegação "para cima" (Up), à iOS/Android: o chevron de voltar da top bar
 * leva ao **pai na hierarquia**, não ao URL anterior do histórico. `history.back()`
 * só está certo quando o histórico coincide com a hierarquia — falha em deep
 * links, notificações, refresh, ou navegação lateral.
 *
 * Hierarquia:
 *   /groups
 *     /groups/[g]/(trips|expenses|admin)      → /groups
 *       /groups/[g]/trips/[t]                 → /groups/[g]/trips
 *       /groups/[g]/expenses/[e]               → /groups/[g]/expenses
 *         /groups/[g]/expenses/[e]/items        → /groups/[g]/expenses/[e]
 *       /groups/[g]/admin/trips/[t]           → /groups/[g]/admin
 */
export function parentPath(pathname: string): string | null {
  const m = pathname.match(/^\/groups\/([^/]+)(?:\/(.+?))?\/?$/);
  if (!m) return null;

  const groupId = m[1];
  const rest = m[2];
  if (!rest) return '/groups'; // /groups/[g]

  const seg = rest.split('/');
  if (seg.length === 1) return '/groups'; // tab-root do grupo → lista de grupos
  if (seg[0] === 'admin') return `/groups/${groupId}/admin`; // admin/trips/[t] → admin
  if (seg[0] === 'expenses' && seg.length === 3 && seg[2] === 'items') {
    return `/groups/${groupId}/expenses/${seg[1]}`; // expenses/[e]/items → expenses/[e]
  }
  return `/groups/${groupId}/${seg[0]}`; // trips/[t] → trips ; expenses/[e] → expenses
}

/* ---- Pilha de rotas visitadas (para escolher entre back() e push(pai)) ---- */

const visited: string[] = [];

export function recordVisit(pathname: string): void {
  if (visited[visited.length - 1] === pathname) return;
  visited.push(pathname);
  if (visited.length > 40) visited.shift();
}

/** A rota imediatamente anterior à atual, se houver. */
export function previousVisit(): string | undefined {
  return visited[visited.length - 2];
}
