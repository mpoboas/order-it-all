// Aritmética de dinheiro do livro-razão — tudo em cêntimos (inteiros) para não
// acumular erro de vírgula flutuante. Os valores em euros (`Expense.amount`,
// `ExpenseShare.amount`, …) são a representação de leitura/gravação; todo o
// cálculo passa por aqui.

/** `12.5` → `1250`. Arredonda ao cêntimo mais próximo. */
export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

/** `1250` → `12.5`. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Distribui `totalCents` por `weights` (pesos não-negativos, não precisam de
 * somar nada em particular) de forma que a soma dos resultados seja sempre
 * exatamente `totalCents` — método do **maior resto**: cada parte recebe o
 * proporcional arredondado por baixo, e os cêntimos que sobram vão, um a um,
 * para quem perdeu mais no arredondamento.
 *
 * Pesos todos a zero → distribui em partes iguais (evita divisão por zero e
 * corresponde ao que se espera de um "split igual" sem inputs).
 */
export function splitCents(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const effectiveWeights = totalWeight > 0 ? weights : weights.map(() => 1);
  const effectiveTotal = totalWeight > 0 ? totalWeight : n;

  const raw = effectiveWeights.map((w) => (totalCents * w) / effectiveTotal);
  const floors = raw.map(Math.floor);
  const assigned = floors.reduce((sum, v) => sum + v, 0);
  let remainder = totalCents - assigned;

  // Distribui os cêntimos em falta pelos que mais perderam no arredondamento
  // (maior parte fracionária primeiro); em empate, mantém a ordem original.
  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i] += 1;
    remainder -= 1;
  }
  // (remainder < 0 não deve acontecer com pesos não-negativos, mas por
  // segurança — nunca deixar a soma fugir do total pedido.)
  for (let k = 0; remainder < 0 && k < order.length; k++) {
    const idx = order[order.length - 1 - k].i;
    result[idx] -= 1;
    remainder += 1;
  }

  return result;
}
