import type { Expense, Party } from '@/lib/types';
import { canonicalPartyId, partyLabel } from '@/lib/parties';
import { toCents, fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';

const PB_BASE = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';

/** Ordena por `date` (mais recente primeiro) e, dentro do mesmo dia, por
 *  `created` (mais recente primeiro) — `date` sozinho não desempata duas
 *  despesas lançadas no mesmo dia (é só uma data, sem hora), o que dava
 *  ordem arbitrária a despesas adicionadas há pouco. */
export function compareExpensesRecentFirst(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.created.localeCompare(a.created);
}

/** URL da foto do recibo (Fase 6) — `undefined` se a despesa não tiver uma. */
export function expenseReceiptUrl(expense: Expense): string | undefined {
  if (!expense.receipt) return undefined;
  return `${PB_BASE}/api/files/expenses/${expense.id}/${expense.receipt}`;
}

/** Nunca `Intl` com `month: 'short'` (dá numérico em pt-PT) — tabela própria
 *  para a coluna de data empilhada da lista de despesas. */
const MONTH_ABBREV_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function parseLocalDate(iso: string): Date {
  // `iso` vem de um `<input type="date">` ("2026-07-23") ou de `created`
  // ("2026-07-23 10:00:00.000Z") — só a parte da data interessa aqui, e
  // interpretá-la como UTC evita saltar de dia perto da meia-noite consoante
  // o fuso do dispositivo.
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatDayMonthAbbrev(iso: string): { day: string; month: string } {
  const date = parseLocalDate(iso);
  return {
    day: String(date.getUTCDate()),
    month: MONTH_ABBREV_PT[date.getUTCMonth()],
  };
}

/** "Julho 2026" — cabeçalho de grupo de mês. */
export function formatMonthHeading(iso: string): string {
  const date = parseLocalDate(iso);
  const label = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "2026-07"
}

export interface ExpenseMonthGroup {
  key: string;
  /** `null` para o mês corrente — a lista não repete "Setembro 2026" no topo. */
  heading: string | null;
  expenses: Expense[];
}

/** Agrupa despesas por mês (mais recente primeiro), já ordenadas por data
 *  dentro de cada grupo. */
export function groupExpensesByMonth(expenses: Expense[]): ExpenseMonthGroup[] {
  const sorted = [...expenses].sort(compareExpensesRecentFirst);
  const currentKey = monthKey(new Date().toISOString());

  const groups = new Map<string, Expense[]>();
  for (const e of sorted) {
    const key = monthKey(e.date);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([key, list]) => ({
    key,
    heading: key === currentKey ? null : formatMonthHeading(list[0].date),
    expenses: list,
  }));
}

/** Quanto uma parte ganha (+) ou perde (-) só nesta despesa — euros. `null`
 *  se não participa nem como pagador nem como devedor. */
export function myAmountForExpense(
  expense: Expense,
  myId: string,
  parties: Map<string, Party>,
): number | null {
  let cents = 0;
  let involved = false;
  for (const payer of expense.payers) {
    if (canonicalPartyId(payer.party, parties) === myId) {
      cents += toCents(payer.amount);
      involved = true;
    }
  }
  for (const share of expense.shares) {
    if (canonicalPartyId(share.party, parties) === myId) {
      cents -= toCents(share.amount);
      involved = true;
    }
  }
  return involved ? fromCents(cents) : null;
}

/** "Ana pagou 30,00 €" / "2 pessoas pagaram 30,00 €" / `null` sem pagador. */
export function payerSummaryLabel(expense: Expense, parties: Map<string, Party>): string | null {
  if (expense.payers.length === 0) return null;
  if (expense.payers.length === 1) {
    return `${partyLabel(expense.payers[0].party, parties)} pagou ${formatEUR(expense.amount)}`;
  }
  return `${expense.payers.length} pessoas pagaram ${formatEUR(expense.amount)}`;
}

/** "Pedro T. pagou ao Guga 26,19 €." — frase única para um registo de
 *  pagamento (kind === 'payment', sempre um pagador e um recebedor). */
export function paymentSentence(expense: Expense, parties: Map<string, Party>, myId?: string): string {
  const payer = expense.payers[0]?.party;
  const receiver = expense.shares[0]?.party;
  const amount = formatEUR(expense.amount);
  if (!payer || !receiver) return `Pagamento de ${amount}.`;

  const payerIsMe = myId && canonicalPartyId(payer, parties) === myId;
  const receiverIsMe = myId && canonicalPartyId(receiver, parties) === myId;
  const payerLabel = payerIsMe ? 'Tu' : partyLabel(payer, parties);
  if (receiverIsMe) {
    return `${payerLabel} pagou-te ${amount}.`;
  }
  const receiverLabel = partyLabel(receiver, parties);
  return `${payerLabel} pagou ${payerIsMe ? 'a' : 'ao'} ${receiverLabel} ${amount}.`;
}
