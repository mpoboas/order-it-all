'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Group, Trip, Order, Item, Split, User, Expense, Placeholder, Party, ExpenseComment, Friendship } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';
import { buildPartyMap, canonicalPartyId, groupMembersFromExpand } from '@/lib/parties';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { compareExpensesRecentFirst } from '@/lib/expenseDisplay';
import {
  balanceFor,
  netByParty,
  netPairwise,
  pairwiseDebts,
  simplifiedToPairwise,
  simplifyDebts,
} from '@/lib/ledger/balances';
import { db } from './schema';

/**
 * Wrappers finos de `useLiveQuery` com o mesmo filtro/sort que as páginas usavam
 * nos `getFullList`.
 *
 * Cada wrapper sobrepõe os utilizadores frescos da tabela `users` por cima do
 * `expand` que veio do servidor — assim um rename/avatar novo reflete-se em toda
 * a app sem re-hidratar (o `expand` embebido fica como fallback).
 */

/**
 * `useLiveQuery` devolve `undefined` no primeiro render depois de (re)montar,
 * mesmo quando os dados já estão em IndexedDB — o que faz a página piscar um
 * skeleton a cada re-navegação (nota-se sobretudo a voltar a `/groups`, onde a
 * View Transition apanha o skeleton no snapshot "novo"). Guardamos o último
 * resultado por chave e devolvemo-lo nesse intervalo: dados reais (talvez com 1
 * frame de atraso) em vez de `undefined`. A query resolve logo a seguir e
 * corrige se algo mudou.
 */
const liveResultCache = new Map<string, unknown>();

/** Limpar na troca de utilizador / logout (o Dexie é apagado). */
export function clearLiveResultCache(): void {
  liveResultCache.clear();
}

function useCachedLiveQuery<T>(
  cacheKey: string,
  querier: () => Promise<T>,
  deps: unknown[],
): T | undefined {
  const live = useLiveQuery(querier, deps);
  if (live !== undefined) liveResultCache.set(cacheKey, live);
  return live !== undefined
    ? live
    : (liveResultCache.get(cacheKey) as T | undefined);
}

const byCreatedDesc = <T extends { created: string }>(a: T, b: T) =>
  b.created.localeCompare(a.created);

const SINGLE_USER_KEYS = [
  'creator', 'created_by', 'user', 'updated_by', 'deleted_by', 'claimed_by',
  'user_a', 'user_b', 'requested_by',
] as const;
const ARRAY_USER_KEYS = ['members', 'admins', 'participants'] as const;

type WithExpand = { expand?: Record<string, unknown> };

function overlayUsers<T extends WithExpand>(record: T, byId: Map<string, User>): T {
  const expand = record.expand;
  if (!expand || byId.size === 0) return record;

  let next = expand;
  const patch = (key: string, value: unknown) => {
    if (next === expand) next = { ...expand };
    next[key] = value;
  };

  for (const key of SINGLE_USER_KEYS) {
    const u = expand[key] as User | undefined;
    const fresh = u?.id ? byId.get(u.id) : undefined;
    if (fresh && fresh !== u) patch(key, fresh);
  }
  for (const key of ARRAY_USER_KEYS) {
    const arr = expand[key] as User[] | undefined;
    if (!Array.isArray(arr)) continue;
    let changed = false;
    const mapped = arr.map((u) => {
      const fresh = u?.id ? byId.get(u.id) : undefined;
      if (fresh && fresh !== u) changed = true;
      return fresh ?? u;
    });
    if (changed) patch(key, mapped);
  }

  return next === expand ? record : { ...record, expand: next };
}

function usersMap(list: User[]): Map<string, User> {
  return new Map(list.map((u) => [u.id, u]));
}

export function useGroups(userId: string | undefined): Group[] | undefined {
  return useCachedLiveQuery(`groups:${userId ?? ''}`, async () => {
    if (!userId) return [];
    const [all, users] = await Promise.all([db.groups.toArray(), db.users.toArray()]);
    const byId = usersMap(users);
    return all
      .filter((g) => g.members?.includes(userId))
      .sort(byCreatedDesc)
      .map((g) => overlayUsers(g, byId));
  }, [userId]);
}

export function useGroup(groupId: string | undefined): Group | undefined | null {
  return useCachedLiveQuery(`group:${groupId ?? ''}`, async () => {
    if (!groupId) return null;
    const [g, users] = await Promise.all([
      db.groups.get(groupId),
      db.users.toArray(),
    ]);
    return g ? overlayUsers(g, usersMap(users)) : null;
  }, [groupId]);
}

export function useTrips(groupId: string | undefined): Trip[] | undefined {
  return useCachedLiveQuery(`trips:${groupId ?? ''}`, async () => {
    if (!groupId) return [];
    const [trips, users] = await Promise.all([
      db.trips.where('group_id').equals(groupId).toArray(),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return trips.sort(byCreatedDesc).map((t) => overlayUsers(t, byId));
  }, [groupId]);
}

export function useTrip(tripId: string | undefined): Trip | undefined | null {
  return useCachedLiveQuery(`trip:${tripId ?? ''}`, async () => {
    if (!tripId) return null;
    const [t, users] = await Promise.all([
      db.trips.get(tripId),
      db.users.toArray(),
    ]);
    return t ? overlayUsers(t, usersMap(users)) : null;
  }, [tripId]);
}

export function useOrders(tripId: string | undefined): Order[] | undefined {
  return useCachedLiveQuery(`orders:${tripId ?? ''}`, async () => {
    if (!tripId) return [];
    const [orders, users] = await Promise.all([
      db.orders.where('trip_id').equals(tripId).toArray(),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return orders.sort(byCreatedDesc).map((o) => overlayUsers(o, byId));
  }, [tripId]);
}

export function useItems(orderIds: string[]): Item[] | undefined {
  const key = orderIds.join(',');
  return useCachedLiveQuery(`items:${key}`, async () => {
    if (!orderIds.length) return [];
    const items = await db.items.where('order_id').anyOf(orderIds).toArray();
    return items.sort((a, b) => a.created.localeCompare(b.created));
  }, [key]);
}

export function useSplits(groupId: string | undefined): Split[] | undefined {
  return useCachedLiveQuery(`splits:${groupId ?? ''}`, async () => {
    if (!groupId) return [];
    const [splits, users] = await Promise.all([
      db.splits.where('group_id').equals(groupId).toArray(),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return splits
      .sort(byCreatedDesc)
      .map((s) => overlayUsers(normalizeSplitRecord(s), byId));
  }, [groupId]);
}

export function useSplit(splitId: string | undefined): Split | undefined | null {
  return useCachedLiveQuery(`split:${splitId ?? ''}`, async () => {
    if (!splitId) return null;
    const [s, users] = await Promise.all([
      db.splits.get(splitId),
      db.users.toArray(),
    ]);
    return s ? overlayUsers(normalizeSplitRecord(s), usersMap(users)) : null;
  }, [splitId]);
}

// --- Livro-razão de despesas -----------------------------------------------
//
// `expenses`/`placeholders` sincronizam globalmente (ver sync.ts) — o Dexie já
// só contém os grupos a que o utilizador pertence, por isso `useAllExpenses`
// não precisa de filtrar por grupo.

export function useExpenses(groupId: string | undefined): Expense[] | undefined {
  return useCachedLiveQuery(`expenses:${groupId ?? ''}`, async () => {
    if (!groupId) return [];
    const [expenses, users] = await Promise.all([
      db.expenses.where('group_id').equals(groupId).toArray(),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return expenses
      .sort(compareExpensesRecentFirst)
      .map((e) => overlayUsers(e, byId));
  }, [groupId]);
}

export function useExpense(expenseId: string | undefined): Expense | undefined | null {
  return useCachedLiveQuery(`expense:${expenseId ?? ''}`, async () => {
    if (!expenseId) return null;
    const [e, users] = await Promise.all([
      db.expenses.get(expenseId),
      db.users.toArray(),
    ]);
    return e ? overlayUsers(e, usersMap(users)) : null;
  }, [expenseId]);
}

/** Todas as despesas de todos os grupos do utilizador — para a home e a
 *  Atividade global. */
export function useAllExpenses(): Expense[] | undefined {
  return useCachedLiveQuery('expenses:all', async () => {
    const [expenses, users] = await Promise.all([db.expenses.toArray(), db.users.toArray()]);
    const byId = usersMap(users);
    return expenses.map((e) => overlayUsers(e, byId));
  }, []);
}

export function usePlaceholders(groupId: string | undefined): Placeholder[] | undefined {
  return useCachedLiveQuery(`placeholders:${groupId ?? ''}`, async () => {
    if (!groupId) return [];
    const [placeholders, users] = await Promise.all([
      db.placeholders.where('group_id').equals(groupId).toArray(),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return placeholders.map((p) => overlayUsers(p, byId));
  }, [groupId]);
}

export function useAllPlaceholders(): Placeholder[] | undefined {
  return useCachedLiveQuery('placeholders:all', async () => db.placeholders.toArray(), []);
}

function useAllUsers(): User[] | undefined {
  return useCachedLiveQuery('users:all', async () => db.users.toArray(), []);
}

/** Partes de um grupo (membros com conta + placeholders), por id — ver
 *  `src/lib/parties.ts` para a resolução canónica/nomes/avatares. */
export function useParties(groupId: string | undefined): Map<string, Party> | undefined {
  const group = useGroup(groupId);
  const placeholders = usePlaceholders(groupId);
  return useMemo(() => {
    if (group === undefined || placeholders === undefined) return undefined;
    return buildPartyMap(groupMembersFromExpand(group), placeholders);
  }, [group, placeholders]);
}

/** Partes para uma despesa direta sem grupo (Fase 8) — só utilizadores reais
 *  (nunca há placeholders fora de um grupo), a partir de `Expense.participants`. */
export function usePartiesForUserIds(userIds: string[] | undefined): Map<string, Party> | undefined {
  const allUsers = useAllUsers();
  return useMemo(() => {
    if (!userIds || allUsers === undefined) return undefined;
    const usersById = usersMap(allUsers);
    const users = userIds.map((id) => usersById.get(id)).filter((u): u is User => Boolean(u));
    return buildPartyMap(users, []);
  }, [userIds, allUsers]);
}

/** Saldo líquido (cêntimos) do utilizador em cada grupo onde é membro — para
 *  a frase "No total, deves/devem-te X" da home e o saldo por `GroupCard`. */
export function useGroupBalances(userId: string | undefined): Map<string, number> | undefined {
  const groups = useGroups(userId);
  const allExpenses = useAllExpenses();
  const allPlaceholders = useAllPlaceholders();

  return useMemo(() => {
    if (!userId || groups === undefined || allExpenses === undefined || allPlaceholders === undefined) {
      return undefined;
    }
    const expensesByGroup = new Map<string, Expense[]>();
    for (const e of allExpenses) {
      if (!e.group_id) continue; // despesa direta (Fase 8) — sem grupo, fora deste saldo
      const list = expensesByGroup.get(e.group_id) ?? [];
      list.push(e);
      expensesByGroup.set(e.group_id, list);
    }
    const placeholdersByGroup = new Map<string, Placeholder[]>();
    for (const p of allPlaceholders) {
      const list = placeholdersByGroup.get(p.group_id) ?? [];
      list.push(p);
      placeholdersByGroup.set(p.group_id, list);
    }

    const result = new Map<string, number>();
    for (const group of groups) {
      const parties = buildPartyMap(
        groupMembersFromExpand(group),
        placeholdersByGroup.get(group.id) ?? [],
      );
      const net = netByParty(expensesByGroup.get(group.id) ?? [], (id) =>
        canonicalPartyId(id, parties),
      );
      result.set(group.id, net[userId] ?? 0);
    }
    return result;
  }, [userId, groups, allExpenses, allPlaceholders]);
}

export interface GroupLedger {
  /** Saldo líquido por id canónico de parte, em cêntimos. */
  net: Record<string, number>;
  /** debtor → credor → cêntimos — já simplificado ou não, consoante
   *  `group.simplify_debts` (default true). */
  pairwise: Record<string, Record<string, number>>;
  parties: Map<string, Party>;
}

/** Saldos de um grupo — usado pela faixa de saldo, o ecrã de Saldos e a
 *  lista de membros. Respeita `groups.simplify_debts` do próprio grupo. */
export function useGroupLedger(groupId: string | undefined): GroupLedger | undefined {
  const group = useGroup(groupId);
  const expenses = useExpenses(groupId);
  const parties = useParties(groupId);

  return useMemo(() => {
    if (group === undefined || expenses === undefined || parties === undefined) return undefined;
    const resolve = (id: string) => canonicalPartyId(id, parties);
    const active = expenses.filter((e) => !e.deleted_at);
    const net = netByParty(active, resolve);
    const rawPairwise = pairwiseDebts(active, resolve);
    const simplify = group?.simplify_debts ?? true;
    const pairwise = simplify ? simplifiedToPairwise(simplifyDebts(net)) : netPairwise(rawPairwise);
    return { net, pairwise, parties };
  }, [group, expenses, parties]);
}

/** Comentários de uma despesa (Fase 5), com o autor sobreposto por
 *  `db.users` (mesmo padrão de `overlayUsers` dos outros hooks). */
export function useComments(expenseId: string | undefined): ExpenseComment[] | undefined {
  return useCachedLiveQuery(`comments:${expenseId ?? ''}`, async () => {
    if (!expenseId) return [];
    const [comments, users] = await Promise.all([
      db.expense_comments.where('expense_id').equals(expenseId).sortBy('created'),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return comments.map((c) => overlayUsers(c, byId));
  }, [expenseId]);
}

export interface PersonBalance {
  /** Id de utilizador (com conta) — só pessoas com conta são somáveis entre
   *  grupos; placeholders são por natureza locais a um grupo. */
  userId: string;
  party: Party;
  /** Positivo = deve-te (total: grupos partilhados + despesas diretas). */
  netCents: number;
  groups: { groupId: string; groupName: string; netCents: number }[];
  /** Parte de `netCents` vinda de despesas sem grupo (Fase 8) — a UI usa isto
   *  para mostrar uma linha "Despesas diretas" separada dos grupos. */
  directNetCents: number;
}

function partyFromUser(u: User | undefined, fallbackId: string): Party {
  if (!u) return { id: fallbackId, name: 'Alguém', kind: 'user' };
  return {
    id: u.id,
    name: u.name || u.email || 'Sem nome',
    avatar: getUserAvatarUrl(u.id, u.avatar),
    email: u.email,
    mbwayPhone: u.mbway_phone,
    username: u.username,
    kind: 'user',
  };
}

/** Saldo por pessoa, somado a todos os grupos partilhados com o utilizador
 *  (tab "Pessoas") **e** a despesas diretas sem grupo (Fase 8) — usa
 *  `useAllExpenses`/`useAllPlaceholders` (já sincronizados globalmente) em
 *  vez de ir grupo a grupo. Amizades aceites sem despesa nenhuma entram na
 *  lista com saldo zero ("Contas em dia"), como no Splitwise. */
export function usePeopleBalances(currentUserId: string | undefined): PersonBalance[] | undefined {
  const groups = useGroups(currentUserId);
  const allExpenses = useAllExpenses();
  const allPlaceholders = useAllPlaceholders();
  const allUsers = useAllUsers();
  const friendships = useCachedLiveQuery(`friendships:raw:${currentUserId ?? ''}`, async () => {
    if (!currentUserId) return [];
    return [
      ...(await db.friendships.where('user_a').equals(currentUserId).toArray()),
      ...(await db.friendships.where('user_b').equals(currentUserId).toArray()),
    ];
  }, [currentUserId]);

  return useMemo(() => {
    if (
      !currentUserId ||
      groups === undefined ||
      allExpenses === undefined ||
      allPlaceholders === undefined ||
      allUsers === undefined ||
      friendships === undefined
    ) {
      return undefined;
    }
    const usersById = usersMap(allUsers);
    const byUser = new Map<string, PersonBalance>();

    const ensureEntry = (userId: string): PersonBalance => {
      let entry = byUser.get(userId);
      if (!entry) {
        entry = { userId, party: partyFromUser(usersById.get(userId), userId), netCents: 0, groups: [], directNetCents: 0 };
        byUser.set(userId, entry);
      }
      return entry;
    };

    // 1. saldos por grupo partilhado (como antes)
    for (const group of groups) {
      const parties = buildPartyMap(
        groupMembersFromExpand(group),
        allPlaceholders.filter((p) => p.group_id === group.id),
      );
      const resolve = (id: string) => canonicalPartyId(id, parties);
      const groupExpenses = allExpenses.filter((e) => e.group_id === group.id && !e.deleted_at);
      const net = netByParty(groupExpenses, resolve);
      const pairwise = netPairwise(pairwiseDebts(groupExpenses, resolve));
      const { lines } = balanceFor(currentUserId, pairwise, net);

      for (const line of lines) {
        const party = parties.get(line.party);
        if (party?.kind !== 'user') continue; // placeholders não se somam entre grupos
        const entry = ensureEntry(party.id);
        entry.party = party;
        entry.netCents += line.amountCents;
        entry.groups.push({ groupId: group.id, groupName: group.name, netCents: line.amountCents });
      }
    }

    // 2. despesas diretas sem grupo — identidade já é o id real (sem placeholders)
    const directExpenses = allExpenses.filter(
      (e) => !e.group_id && !e.deleted_at && e.participants?.includes(currentUserId),
    );
    if (directExpenses.length) {
      const identity = (id: string) => id;
      const net = netByParty(directExpenses, identity);
      const pairwise = netPairwise(pairwiseDebts(directExpenses, identity));
      const { lines } = balanceFor(currentUserId, pairwise, net);
      for (const line of lines) {
        const entry = ensureEntry(line.party);
        entry.netCents += line.amountCents;
        entry.directNetCents += line.amountCents;
      }
    }

    // 3. amizades aceites sem despesa nenhuma ainda → entram com saldo zero
    for (const f of friendships) {
      if (f.status !== 'accepted') continue;
      ensureEntry(f.user_a === currentUserId ? f.user_b : f.user_a);
    }

    return Array.from(byUser.values()).sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
  }, [currentUserId, groups, allExpenses, allPlaceholders, allUsers, friendships]);
}

export interface BalanceOverview {
  /** Soma das partes positivas de `netCents` de todas as pessoas — a receber no total. */
  receiveCents: number;
  /** Soma dos valores absolutos das partes negativas — a pagar no total. */
  payCents: number;
  netCents: number;
}

/** Resumo agregado "a receber vs a pagar" para o topo do Início — soma
 *  `usePeopleBalances` (já inclui grupos partilhados + despesas diretas). */
export function useBalanceOverview(userId: string | undefined): BalanceOverview | undefined {
  const people = usePeopleBalances(userId);
  return useMemo(() => {
    if (!people) return undefined;
    let receiveCents = 0;
    let payCents = 0;
    for (const p of people) {
      if (p.netCents > 0) receiveCents += p.netCents;
      else payCents += -p.netCents;
    }
    return { receiveCents, payCents, netCents: receiveCents - payCents };
  }, [people]);
}

/** Amigos aceites / pedidos recebidos / pedidos enviados (Fase 8). */
export interface FriendshipsView {
  accepted: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
}

export function useFriendships(userId: string | undefined): FriendshipsView | undefined {
  const raw = useCachedLiveQuery(`friendships:${userId ?? ''}`, async () => {
    if (!userId) return [];
    const [rows, users] = await Promise.all([
      Promise.all([
        db.friendships.where('user_a').equals(userId).toArray(),
        db.friendships.where('user_b').equals(userId).toArray(),
      ]).then(([a, b]) => [...a, ...b]),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return rows.map((f) => overlayUsers(f, byId));
  }, [userId]);

  return useMemo(() => {
    if (!userId || raw === undefined) return undefined;
    const accepted: Friendship[] = [];
    const incoming: Friendship[] = [];
    const outgoing: Friendship[] = [];
    for (const f of raw) {
      if (f.status === 'accepted') accepted.push(f);
      else if (f.requested_by === userId) outgoing.push(f);
      else incoming.push(f);
    }
    return { accepted, incoming, outgoing };
  }, [userId, raw]);
}

/** Despesas diretas (sem grupo) entre o utilizador e um amigo — para o
 *  histórico na página da pessoa (Fase 8). */
export function useDirectExpenses(userId: string | undefined, friendId: string | undefined): Expense[] | undefined {
  return useCachedLiveQuery(`directExpenses:${userId ?? ''}:${friendId ?? ''}`, async () => {
    if (!userId || !friendId) return [];
    const [expenses, users] = await Promise.all([
      db.expenses.where('participants').equals(userId).toArray(),
      db.users.toArray(),
    ]);
    const byId = usersMap(users);
    return expenses
      .filter((e) => !e.group_id && e.participants?.includes(friendId))
      .sort(compareExpensesRecentFirst)
      .map((e) => overlayUsers(e, byId));
  }, [userId, friendId]);
}
