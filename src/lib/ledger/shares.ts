import { splitCents, toCents } from './money';

/** Um modo de divisão calculável por esta função — `itemized` não entra aqui:
 *  as suas partes vêm de `calculateSplitTotals` (`src/lib/splitShare.ts`) sobre
 *  os itens do split ligado; ver `sharesFromEuroTotals` abaixo para as
 *  converter para o mesmo formato. */
export type ComputableSplitMode =
  | 'equal'
  | 'exact'
  | 'percentage'
  | 'shares'
  | 'adjustment';

export interface ComputedShare {
  party: string;
  amountCents: number;
  /** Valor original introduzido no modo (%, quotas, ajuste em euros) — guarda-se
   *  para reabrir o formulário sem perder o que a pessoa escreveu. */
  input?: number;
}

export interface ComputeSharesResult {
  shares: ComputedShare[];
  /** Mensagem pt-PT pronta a mostrar, ou `undefined` se válido. */
  error?: string;
}

const EPS = 0.01;

function centsFromEurosMap(inputs: Record<string, number>, parties: string[]): number[] {
  return parties.map((p) => toCents(inputs[p] ?? 0));
}

/**
 * Calcula quanto cada parte deve, em cêntimos, dado o modo e os inputs do
 * utilizador (euros, percentagem ou quotas, consoante o modo). Valida que os
 * inputs fazem sentido para o total — devolve `error` (pt-PT) em vez de dados
 * inconsistentes.
 */
export function computeShares(
  mode: ComputableSplitMode,
  amountCents: number,
  participantIds: string[],
  inputs: Record<string, number> = {},
): ComputeSharesResult {
  const n = participantIds.length;
  if (n === 0) {
    return { shares: [], error: 'Escolhe pelo menos uma pessoa.' };
  }

  switch (mode) {
    case 'equal': {
      const cents = splitCents(amountCents, participantIds.map(() => 1));
      return {
        shares: participantIds.map((party, i) => ({ party, amountCents: cents[i] })),
      };
    }

    case 'exact': {
      const cents = centsFromEurosMap(inputs, participantIds);
      const sum = cents.reduce((s, c) => s + c, 0);
      if (sum !== amountCents) {
        return {
          shares: participantIds.map((party, i) => ({ party, amountCents: cents[i], input: inputs[party] })),
          error: `Os valores têm de somar ao total (${(amountCents / 100).toFixed(2)} €). Estão em ${(sum / 100).toFixed(2)} €.`,
        };
      }
      return {
        shares: participantIds.map((party, i) => ({ party, amountCents: cents[i], input: inputs[party] })),
      };
    }

    case 'percentage': {
      const pcts = participantIds.map((p) => inputs[p] ?? 0);
      const sumPct = pcts.reduce((s, v) => s + v, 0);
      const cents = splitCents(amountCents, pcts);
      const shares = participantIds.map((party, i) => ({
        party,
        amountCents: cents[i],
        input: inputs[party],
      }));
      if (Math.abs(sumPct - 100) > EPS) {
        return { shares, error: `As percentagens têm de somar 100 %. Estão em ${sumPct.toFixed(1)} %.` };
      }
      return { shares };
    }

    case 'shares': {
      const quotas = participantIds.map((p) => inputs[p] ?? 0);
      const sumQuotas = quotas.reduce((s, v) => s + v, 0);
      const shares = participantIds.map((party) => ({
        party,
        amountCents: 0,
        input: inputs[party],
      }));
      if (sumQuotas <= 0) {
        return { shares, error: 'Atribui pelo menos uma quota.' };
      }
      const cents = splitCents(amountCents, quotas);
      return {
        shares: participantIds.map((party, i) => ({ party, amountCents: cents[i], input: inputs[party] })),
      };
    }

    case 'adjustment': {
      const adjustmentsCents = centsFromEurosMap(inputs, participantIds);
      const totalAdjustment = adjustmentsCents.reduce((s, c) => s + c, 0);
      const remaining = amountCents - totalAdjustment;
      if (remaining < 0) {
        return {
          shares: participantIds.map((party, i) => ({ party, amountCents: adjustmentsCents[i], input: inputs[party] })),
          error: 'Os ajustes não podem ultrapassar o total da despesa.',
        };
      }
      const base = splitCents(remaining, participantIds.map(() => 1));
      return {
        shares: participantIds.map((party, i) => ({
          party,
          amountCents: base[i] + adjustmentsCents[i],
          input: inputs[party],
        })),
      };
    }

    default:
      return { shares: [], error: 'Modo de divisão desconhecido.' };
  }
}

/** Converte totais em euros (ex.: `calculateSplitTotals` de `splitShare.ts`,
 *  usado no modo `itemized`) para o mesmo formato de `ComputedShare`. */
export function sharesFromEuroTotals(totals: Record<string, number>): ComputedShare[] {
  return Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .map(([party, amount]) => ({ party, amountCents: toCents(amount) }));
}
