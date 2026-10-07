/**
 * Nome de item com o original do talão entre parênteses no fim:
 * "Cebola (ZWIEBEL)". O scan de faturas noutra língua traduz o nome para PT e
 * guarda o original assim — num único texto, sem campo novo nem migração, e
 * legível tal como está onde quer que o nome apareça em bruto (notificações,
 * partilha, pesquisa). Na UI, `<ItemName>` mostra o original como subtítulo.
 *
 * Contrapartida conhecida: um nome que já termine em parênteses
 * ("Iogurte (pack 4)") também mostra esse texto como subtítulo — continua
 * legível, só muda de linha.
 */

const TRAILING_PARENS = /^(.*\S)\s*\(([^()]+)\)\s*$/;

export function splitItemName(name: string): { title: string; original?: string } {
  const m = name.match(TRAILING_PARENS);
  if (!m) return { title: name };
  const original = m[2].trim();
  return original ? { title: m[1], original } : { title: name };
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

/**
 * Junta o nome traduzido ao original do talão. Sem original, ou quando é
 * igual ao traduzido (talão já em PT, marcas), devolve só o nome.
 */
export function withOriginalName(name: string, original?: string | null): string {
  const title = name.trim();
  const orig = original?.replace(/[()]/g, '').trim();
  if (!title) return orig ?? '';
  if (!orig || normalize(orig) === normalize(title)) return title;
  return `${title} (${orig})`;
}
