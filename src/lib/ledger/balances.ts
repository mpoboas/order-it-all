import type { Expense } from '@/lib/types';
import { splitCents, toCents } from './money';

/** Resolve o id "canónico" de uma parte — normalmente `canonicalPartyId` de
 *  `src/lib/parties.ts` (funde um placeholder reclamado com o utilizador que
 *  o reclamou, sem reescrever o histórico). */
export type ResolveParty = (partyId: string) => string;

const identity: ResolveParty = (id) => id;

function isCountable(e: Expense): boolean {
  return !e.deleted_at && e.payers.length > 0;
}

/**
 * Saldo líquido de cada parte, em cêntimos: positivo = é-lhe devido
 * (emprestou), negativo = deve. Ignora despesas apagadas e sem pagador
 * ("Falta pagador" fica fora dos saldos).
 */
export function netByParty(
  expenses: Expense[],
  resolveParty: ResolveParty = identity,
): Record<string, number> {
  const net: Record<string, number> = {};
  const add = (party: string, cents: number) => {
    net[party] = (net[party] ?? 0) + cents;
  };

  for (const e of expenses) {
    if (!isCountable(e)) continue;
    for (const payer of e.payers) {
      add(resolveParty(payer.party), toCents(payer.amount));
    }
    for (const share of e.shares) {
      add(resolveParty(share.party), -toCents(share.amount));
    }
  }
  return net;
}

/** debtor → credor → cêntimos que o devedor deve a esse credor, despesa a
 *  despesa (um pagamento com vários pagadores reparte o valor devido
 *  proporcionalmente ao que cada um pagou). Ainda não simplificado — pares
 *  A→B e B→A podem coexistir; usar `netPairwise` para os compensar. */
export function pairwiseDebts(
  expenses: Expense[],
  resolveParty: ResolveParty = identity,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const add = (debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    (result[debtor] ??= {});
    result[debtor][creditor] = (result[debtor][creditor] ?? 0) + cents;
  };

  for (const e of expenses) {
    if (!isCountable(e)) continue;
    const payerWeights = e.payers.map((p) => toCents(p.amount));
    const totalPaidCents = payerWeights.reduce((s, c) => s + c, 0);
    if (totalPaidCents <= 0) continue;

    const shareCents = e.shares.map((s) => toCents(s.amount));
    const matrix = allocateShares(shareCents, payerWeights);
    e.shares.forEach((share, i) => {
      if (shareCents[i] <= 0) return;
      const debtor = resolveParty(share.party);
      e.payers.forEach((payer, j) => {
        add(debtor, resolveParty(payer.party), matrix[i][j]);
      });
    });
  }
  return result;
}

/**
 * Matriz partes × pagadores em cêntimos: `m[i][j]` = quanto da parte `i` foi
 * paga pelo pagador `j` (proporcional ao que cada um pagou).
 *
 * Cada linha é repartida pelo maior resto (Σ linha = parte exata), mas isso
 * sozinho não garante as colunas: quando um devedor também é pagador, o
 * cêntimo de arredondamento pode cair na parte "que deve a si próprio", que
 * `pairwiseDebts` descarta — e as dívidas por par deixavam de bater com o
 * saldo líquido por 1 cêntimo (fantasma de 0,01 € que nunca se liquida).
 * Aqui, quando Σ partes = Σ pagadores, corrige-se também cada coluna para o
 * valor exato pago, movendo cêntimos dentro da mesma linha (a linha mantém-se
 * exata). Cada movimento reduz o desvio total em 2, por isso termina.
 */
function allocateShares(shareCents: number[], payerCents: number[]): number[][] {
  const matrix = shareCents.map((c) => (c > 0 ? splitCents(c, payerCents) : payerCents.map(() => 0)));
  const totalShares = shareCents.reduce((s, c) => s + Math.max(c, 0), 0);
  const totalPaid = payerCents.reduce((s, c) => s + c, 0);
  if (totalShares !== totalPaid) return matrix; // despesa inconsistente (legado): sem garantias

  const colDiff = payerCents.map((paid, j) => matrix.reduce((s, row) => s + row[j], 0) - paid);
  for (;;) {
    const surplus = colDiff.findIndex((d) => d > 0);
    const deficit = colDiff.findIndex((d) => d < 0);
    if (surplus === -1 || deficit === -1) break;
    const row = matrix.find((r) => r[surplus] > 0);
    if (!row) break;
    row[surplus] -= 1;
    row[deficit] += 1;
    colDiff[surplus] -= 1;
    colDiff[deficit] += 1;
  }
  return matrix;
}

/** Compensa pares A→B / B→A no resultado de `pairwiseDebts` — só sobra uma
 *  direção por par, com a diferença. É o que se mostra no ecrã de Saldos
 *  quando "Simplificar dívidas" está desligado. */
export function netPairwise(
  pairwise: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const seen = new Set<string>();

  for (const a of Object.keys(pairwise)) {
    for (const b of Object.keys(pairwise[a])) {
      const key = [a, b].sort().join('␟');
      if (seen.has(key)) continue;
      seen.add(key);
      const ab = pairwise[a]?.[b] ?? 0;
      const ba = pairwise[b]?.[a] ?? 0;
      const diff = ab - ba;
      if (diff > 0) {
        (result[a] ??= {})[b] = diff;
      } else if (diff < 0) {
        (result[b] ??= {})[a] = -diff;
      }
    }
  }
  return result;
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amountCents: number;
}

/**
 * Algoritmo do Splitwise para "Simplificar dívidas": min-cash-flow guloso —
 * ordena credores e devedores pelo valor, casa sempre o maior com o maior.
 * Nunca muda o saldo líquido de ninguém, só reduz o número de pagamentos
 * necessários; pode fazer alguém pagar a uma pessoa com quem nunca teve uma
 * despesa direta.
 */
export function simplifyDebts(net: Record<string, number>): SimplifiedDebt[] {
  const creditors = Object.entries(net)
    .filter(([, amount]) => amount > 0)
    .map(([party, amount]) => ({ party, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(net)
    .filter(([, amount]) => amount < 0)
    .map(([party, amount]) => ({ party, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const result: SimplifiedDebt[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.amount, d.amount);
    if (amount > 0) {
      result.push({ from: d.party, to: c.party, amountCents: amount });
    }
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount <= 0) ci++;
    if (d.amount <= 0) di++;
  }
  return result;
}

/** Converte a lista simplificada para o mesmo formato de `pairwiseDebts`
 *  (debtor → credor → cêntimos), para se poder usar `balanceFor` com ou sem
 *  simplificação através da mesma função. */
export function simplifiedToPairwise(
  simplified: SimplifiedDebt[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const { from, to, amountCents } of simplified) {
    (result[from] ??= {})[to] = (result[from]?.[to] ?? 0) + amountCents;
  }
  return result;
}

export interface BalanceLine {
  /** A outra parte do par. */
  party: string;
  /** Positivo = essa parte deve-te; negativo = tu deves-lhe. */
  amountCents: number;
}

export interface PartyBalance {
  netCents: number;
  lines: BalanceLine[];
}

/** Saldo de uma parte para mostrar no cabeçalho/ecrã de Saldos: líquido +
 *  linhas por pessoa, já ordenadas pelo valor absoluto (as maiores primeiro).
 *  Passa `pairwise` simplificado ou não consoante `groups.simplify_debts`. */
export function balanceFor(
  partyId: string,
  pairwise: Record<string, Record<string, number>>,
  net: Record<string, number>,
): PartyBalance {
  const lines: BalanceLine[] = [];

  for (const [debtor, creditors] of Object.entries(pairwise)) {
    if (debtor === partyId) continue;
    const amount = creditors[partyId];
    if (amount) lines.push({ party: debtor, amountCents: amount });
  }
  for (const [creditor, amount] of Object.entries(pairwise[partyId] ?? {})) {
    if (amount) lines.push({ party: creditor, amountCents: -amount });
  }

  lines.sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));
  return { netCents: net[partyId] ?? 0, lines };
}
