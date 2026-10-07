import type { Expense, Party } from '@/lib/types';
import { balanceFor, groupPairwise, netByParty, type ResolveParty } from './balances';

/**
 * Saldos por pessoa (separador Amigos, página do amigo, mosaicos do Início).
 * Puro — o hook `usePeopleBalances` só junta os dados do Dexie e chama isto.
 *
 * Regra (igual ao Splitwise): o saldo com cada amigo é a soma, grupo a grupo,
 * do que o ecrã de Saldos DESSE grupo diz que um deve ao outro — já
 * simplificado se o grupo tiver "Simplificar dívidas" — mais as despesas
 * diretas entre os dois (nunca simplificadas). Com a simplificação, pode-se
 * dever a alguém com quem nunca se partilhou uma despesa, e um grupo acertado
 * pelas sugestões simplificadas fica a zero com toda a gente.
 */

export interface PeopleGroupScope {
  groupId: string;
  groupName: string;
  /** `groups.simplify_debts ?? true`. */
  simplify: boolean;
  expenses: Expense[];
  parties: Map<string, Party>;
  resolve: ResolveParty;
}

export interface PersonGroupBalance {
  groupId: string;
  groupName: string;
  netCents: number;
  /** O valor vem da simplificação de dívidas do grupo (pode não bater com as despesas entre os dois). */
  simplified: boolean;
}

export interface PersonBalance {
  /** Id de utilizador (com conta) — só pessoas com conta são somáveis entre
   *  grupos; placeholders são por natureza locais a um grupo. */
  userId: string;
  party: Party;
  /** Positivo = deve-te (total: grupos partilhados + despesas diretas). */
  netCents: number;
  groups: PersonGroupBalance[];
  /** Parte de `netCents` vinda de despesas sem grupo (Fase 8) — a UI usa isto
   *  para mostrar uma linha "Despesas diretas" separada dos grupos. */
  directNetCents: number;
}

/** Saldo com um membro SEM conta num grupo — não entra na lista de amigos
 *  (não é somável entre grupos), mas é dinheiro real a receber/pagar. */
export interface PlaceholderBalance {
  groupId: string;
  party: Party;
  /** Positivo = deve-te. */
  amountCents: number;
}

export interface PeopleBalances {
  people: PersonBalance[];
  placeholders: PlaceholderBalance[];
}

export function computePeopleBalances(input: {
  currentUserId: string;
  groups: PeopleGroupScope[];
  /** Despesas sem grupo em que o utilizador participa (já sem as apagadas). */
  directExpenses: Expense[];
  partyForUser: (userId: string) => Party;
  /** Amigos aceites — entram com saldo zero mesmo sem despesas ("Contas em dia"). */
  friendIds: string[];
}): PeopleBalances {
  const { currentUserId } = input;
  const byUser = new Map<string, PersonBalance>();
  const placeholders: PlaceholderBalance[] = [];

  const ensureEntry = (userId: string): PersonBalance => {
    let entry = byUser.get(userId);
    if (!entry) {
      entry = { userId, party: input.partyForUser(userId), netCents: 0, groups: [], directNetCents: 0 };
      byUser.set(userId, entry);
    }
    return entry;
  };

  // 1. grupos — o mesmo "quem deve a quem" do ecrã de Saldos do grupo
  for (const group of input.groups) {
    const net = netByParty(group.expenses, group.resolve);
    const pairwise = groupPairwise(group.expenses, group.resolve, group.simplify);
    const { lines } = balanceFor(currentUserId, pairwise, net);

    for (const line of lines) {
      const party = group.parties.get(line.party);
      if (party?.kind !== 'user') {
        placeholders.push({
          groupId: group.groupId,
          party: party ?? { id: line.party, name: 'Alguém', kind: 'placeholder' },
          amountCents: line.amountCents,
        });
        continue;
      }
      const entry = ensureEntry(party.id);
      entry.party = party;
      entry.netCents += line.amountCents;
      entry.groups.push({
        groupId: group.groupId,
        groupName: group.groupName,
        netCents: line.amountCents,
        simplified: group.simplify,
      });
    }
  }

  // 2. despesas diretas — identidade já é o id real (sem placeholders)
  if (input.directExpenses.length) {
    const identity: ResolveParty = (id) => id;
    const net = netByParty(input.directExpenses, identity);
    const pairwise = groupPairwise(input.directExpenses, identity, false);
    const { lines } = balanceFor(currentUserId, pairwise, net);
    for (const line of lines) {
      const entry = ensureEntry(line.party);
      entry.netCents += line.amountCents;
      entry.directNetCents += line.amountCents;
    }
  }

  // 3. amizades aceites sem despesa nenhuma ainda → saldo zero
  for (const id of input.friendIds) ensureEntry(id);

  const people = Array.from(byUser.values()).sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
  return { people, placeholders };
}

export interface BalanceOverview {
  /** Total a receber — amigos que te devem + membros sem conta que te devem. */
  receiveCents: number;
  /** Total a pagar (valor absoluto). */
  payCents: number;
  netCents: number;
}

/** Resumo "Devem-te / Deves" do Início. Por amigo, compensa entre grupos
 *  (como o painel do Splitwise); membros sem conta contam à parte — com a
 *  simplificação, a tua dívida num grupo pode ficar toda com um deles. */
export function balanceOverview({ people, placeholders }: PeopleBalances): BalanceOverview {
  let receiveCents = 0;
  let payCents = 0;
  const add = (cents: number) => {
    if (cents > 0) receiveCents += cents;
    else payCents += -cents;
  };
  for (const p of people) add(p.netCents);
  for (const p of placeholders) add(p.amountCents);
  return { receiveCents, payCents, netCents: receiveCents - payCents };
}
