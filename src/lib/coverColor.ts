// Capa colorida no topo de um perfil (pessoa/grupo) — cor sempre igual para
// o mesmo nome (hash simples → índice na paleta), sem depender de
// ilustrações que não temos. Pares pensados para dar bem com texto branco
// por cima, em claro e escuro (a capa é sempre a mesma, o tema não lhe mexe).
const PALETTE: Array<[string, string]> = [
  ['#5B8DEF', '#3A5FCD'], // azul
  ['#34C39A', '#1E9E7A'], // verde-água
  ['#F2994A', '#D9722B'], // laranja
  ['#B073E8', '#8B4FD1'], // roxo
  ['#EC6F9B', '#D14C7C'], // rosa
  ['#4FB8D0', '#2E8FA6'], // ciano
  ['#E85D5D', '#C13F3F'], // vermelho
  ['#8FB93A', '#6B9422'], // verde-lima
];

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** `background` CSS pronto a usar em `style` — gradiente diagonal com cor
 *  estável por nome (mesma pessoa/grupo, mesma capa, sempre). */
export function coverGradientFor(name: string): string {
  const [from, to] = PALETTE[hashString(name.trim().toLowerCase()) % PALETTE.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/** Cor sólida do topo da capa (o início do gradiente) — para a barra de
 *  estado do iOS, que só aceita uma cor, não um gradiente (`StatusBarTint`). */
export function coverColorFor(name: string): string {
  return PALETTE[hashString(name.trim().toLowerCase()) % PALETTE.length][0];
}
