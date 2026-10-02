import type { Expense } from '@/lib/types';
import {
  netByParty,
  netPairwise,
  pairwiseDebts,
  simplifiedToPairwise,
  simplifyDebts,
  type ResolveParty,
} from '@/lib/ledger/balances';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import type { OutgoingNotification } from './build';

/**
 * Lembrete mensal de dívidas (dia 1, via cron do PocketBase). Gentil e raro:
 * só avisa quem DEVE, e só pelo que já devia há mais de `minAgeDays` — uma
 * despesa de ontem não conta. "Já devia" = o par devedor→credor existia no
 * saldo de há 15 dias E continua a existir hoje; o valor lembrado é o mais
 * pequeno dos dois (o que está pendurado desde então, não o que acresceu).
 * Um aviso por grupo (e um por amigo nas despesas diretas), nunca por despesa.
 */

const MIN_CENTS = 100; // menos de 1 € não merece um aviso

export interface LedgerScope {
  /** Grupo, ou `''` para despesas diretas entre dois amigos. */
  groupId: string;
  /** Nome do grupo (nas diretas não é usado: o título leva o nome do credor). */
  name: string;
  simplify: boolean;
  expenses: Expense[];
  resolve: ResolveParty;
  /** Utilizador por trás de uma parte; `null` = pessoa sem conta. */
  userOf: (partyId: string) => string | null;
  partyName: (partyId: string) => string;
}

function pairwise(expenses: Expense[], resolve: ResolveParty, simplify: boolean) {
  const active = expenses.filter((e) => !e.deleted_at);
  return simplify
    ? simplifiedToPairwise(simplifyDebts(netByParty(active, resolve)))
    : netPairwise(pairwiseDebts(active, resolve));
}

function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function staleDebtReminders(scopes: LedgerScope[], now: Date, minAgeDays = 15): OutgoingNotification[] {
  const cutoff = now.getTime() - minAgeDays * 86_400_000;
  const out: OutgoingNotification[] = [];

  for (const scope of scopes) {
    const today = pairwise(scope.expenses, scope.resolve, scope.simplify);
    const before = pairwise(
      scope.expenses.filter((e) => new Date(e.created).getTime() <= cutoff),
      scope.resolve,
      scope.simplify,
    );

    for (const [debtor, creditors] of Object.entries(today)) {
      const userId = scope.userOf(debtor);
      if (!userId) continue;
      const stale = Object.entries(creditors)
        .map(([creditor, cents]) => ({ creditor, cents: Math.min(cents, before[debtor]?.[creditor] ?? 0) }))
        .filter((d) => d.cents >= MIN_CENTS);
      if (stale.length === 0) continue;

      const total = fromCents(stale.reduce((sum, d) => sum + d.cents, 0));
      const names = listNames(stale.map((d) => scope.partyName(d.creditor)));
      out.push({
        userId,
        title: scope.groupId ? `💸 ${scope.name}` : `💸 Contas com ${names}`,
        body: `Tens ${formatEUR(total)} por acertar com ${names}. Quando der, acerta na app.`,
        url: scope.groupId
          ? `/groups/${scope.groupId}/expenses?abrir=acertar`
          : `/people/${scope.userOf(stale[0].creditor) ?? ''}`,
        tag: `debt-reminder:${scope.groupId || stale[0].creditor}`,
      });
    }
  }
  return out;
}
