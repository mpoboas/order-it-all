/**
 * Geração e validação de `username` (Fase 8b — "Amigos" via username).
 * Sempre minúsculas — evita toda a complicação de comparação
 * case-insensitive (padrão comum: Twitter/X, GitHub, Discord acabam por
 * normalizar para minúsculas internamente). Formato: `[a-z0-9_.]{3,20}`,
 * sem ponto a abrir/fechar nem pontos seguidos.
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

/** Slug base a partir de um nome — despe acentos, baixa para minúsculas,
 *  remove tudo o que não seja `a-z0-9` (nomes só com emoji/símbolos dão uma
 *  string vazia, daí o fallback). Não inclui `_`/`.` — só faz falta quando a
 *  própria pessoa escolhe o username à mão. */
export function slugifyUsername(name: string): string {
  const base = (name || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, MAX_LENGTH);
  return base.length >= MIN_LENGTH ? base : `user${base}`;
}

/** Formato válido para um username escolhido pela própria pessoa (Perfil). */
export function isValidUsername(u: string): boolean {
  if (u.length < MIN_LENGTH || u.length > MAX_LENGTH) return false;
  if (!/^[a-z0-9_.]+$/.test(u)) return false;
  if (u.startsWith('.') || u.endsWith('.') || u.includes('..')) return false;
  return true;
}

/** Próximo candidato numa colisão — sufixo sequencial determinístico
 *  (`joao`, `joao2`, `joao3`…), mais previsível do que um sufixo aleatório
 *  e sem necessidade real de o esconder aqui (não é uma rede pública). */
export function nextUsernameCandidate(base: string, attempt: number): string {
  if (attempt <= 0) return base;
  const suffix = String(attempt + 1);
  const trimmed = base.slice(0, Math.max(MIN_LENGTH, MAX_LENGTH - suffix.length));
  return `${trimmed}${suffix}`;
}

/** Gera um username único a partir do nome, consultando `isTaken` a cada
 *  tentativa (o chamador decide como verificar — DB real ou um `Set` em
 *  memória durante uma migração em lote). */
export async function generateUniqueUsername(
  name: string,
  isTaken: (candidate: string) => Promise<boolean> | boolean,
): Promise<string> {
  const base = slugifyUsername(name);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = nextUsernameCandidate(base, attempt);
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Não foi possível gerar um username único a partir de "${name}"`);
}
