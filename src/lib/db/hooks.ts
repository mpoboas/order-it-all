'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Group, Trip, Order, Item, Split, User, Expense, Placeholder, Party, ExpenseComment, Friendship } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';
import { buildPartyMap, canonicalPartyId, groupMembersFromExpand } from '@/lib/parties';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { compareExpensesRecentFirst } from '@/lib/expenseDisplay';
import { groupPairwise, netByParty } from '@/lib/ledger/balances';
import {
  balanceOverview,
  computePeopleBalances,
  type BalanceOverview,
  type PeopleBalances,
  type PersonBalance,
} from '@/lib/ledger/people';

export type { BalanceOverview, PersonBalance } from '@/lib/ledger/people';
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
    const groups = all
      .filter((g) => g.members?.includes(userId))
      .sort(byCreatedDesc)
      .map((g) => overlayUsers(g, byId));
    // Aquece a cache por-id (`useGroup`) com o que a lista já sabe — sem isto,
    // entrar num grupo pela lista chama `group:${id}` pela primeira vez e
    // pisca o esqueleto mesmo com os dados já quentes no Dexie (ver Fase 14).
    for (const g of groups) liveResultCache.set(`group:${g.id}`, g);
    return groups;
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

/** Todos os produtos pedidos nas viagens de um grupo (Resumo → "O Clássico
 *  da Lista"). Só nome/quantidade/data — é o que o prémio precisa. */
export function useGroupOrderItems(groupId: string | undefined): { name: string; quantity: number; created: string }[] | undefined {
  return useCachedLiveQuery(`group-order-items:${groupId ?? ''}`, async () => {
    if (!groupId) return [];
    const tripIds = (await db.trips.where('group_id').equals(groupId).toArray()).map((t) => t.id);
    if (!tripIds.length) return [];
    const orderIds = (await db.orders.where('trip_id').anyOf(tripIds).toArray()).map((o) => o.id);
    if (!orderIds.length) return [];
    const items = await db.items.where('order_id').anyOf(orderIds).toArray();
    return items.map((it) => ({ name: it.name, quantity: it.quantity, created: it.created }));
  }, [groupId]);
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
    const net = netByParty(expenses, resolve);
    const pairwise = groupPairwise(expenses, resolve, group?.simplify_debts ?? true);
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

function partyFromUser(u: User | undefined, fallbackId: string): Party {
  if (!u) return { id: fallbackId, name: 'Alguém', kind: 'user' };
  return {
    id: u.id,
    name: u.name || u.email || 'Sem nome',
    avatar: getUserAvatarUrl(u.id, u.avatar),
    email: u.email,
    mbwayPhone: u.mbway_phone,
    revtag: u.revtag,
    username: u.username,
    kind: 'user',
  };
}

/** Saldos por pessoa + membros sem conta, de todos os grupos partilhados e
 *  das despesas diretas — ver `computePeopleBalances` para a regra (respeita a
 *  simplificação de dívidas de cada grupo, como o ecrã de Saldos). Amizades
 *  aceites sem despesa nenhuma entram com saldo zero, como no Splitwise. */
function usePeopleLedger(currentUserId: string | undefined): PeopleBalances | undefined {
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
    return computePeopleBalances({
      currentUserId,
      groups: groups.map((group) => {
        const parties = buildPartyMap(
          groupMembersFromExpand(group),
          allPlaceholders.filter((p) => p.group_id === group.id),
        );
        return {
          groupId: group.id,
          groupName: group.name,
          simplify: group.simplify_debts ?? true,
          expenses: allExpenses.filter((e) => e.group_id === group.id && !e.deleted_at),
          parties,
          resolve: (id: string) => canonicalPartyId(id, parties),
        };
      }),
      directExpenses: allExpenses.filter(
        (e) => !e.group_id && !e.deleted_at && e.participants?.includes(currentUserId),
      ),
      partyForUser: (id) => partyFromUser(usersById.get(id), id),
      friendIds: friendships
        .filter((f) => f.status === 'accepted')
        .map((f) => (f.user_a === currentUserId ? f.user_b : f.user_a)),
    });
  }, [currentUserId, groups, allExpenses, allPlaceholders, allUsers, friendships]);
}

/** Saldo por pessoa (tab "Amigos" e página do amigo). */
export function usePeopleBalances(currentUserId: string | undefined): PersonBalance[] | undefined {
  return usePeopleLedger(currentUserId)?.people;
}

/** Resumo agregado "a receber vs a pagar" para o topo do Início. */
export function useBalanceOverview(userId: string | undefined): BalanceOverview | undefined {
  const ledger = usePeopleLedger(userId);
  return useMemo(() => (ledger ? balanceOverview(ledger) : undefined), [ledger]);
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

export interface SharedExpenseEntry {
  expense: Expense;
  /** `null` = despesa direta sem grupo. */
  groupName: string | null;
}

/** Despesas (de grupo ou diretas) entre dois utilizadores, para a página de
 *  Amigo.
 *
 *  As diretas (sem grupo) filtram-se com segurança pelo índice
 *  `*participants` — nesse caso é sempre id real, nunca placeholder (ver
 *  `Expense.participants`). As de grupo NÃO podem usar o mesmo atalho:
 *  `placeholdersApi.claim` deixa bem claro que "o histórico não é
 *  reescrito, só se marca `claimed_by`" — uma despesa criada enquanto esta
 *  pessoa ainda era um placeholder do grupo nunca teve o `participants`
 *  atualizado depois de reclamar a conta. Por isso, para grupos, resolve-se
 *  o id canónico a partir de `payers`/`shares` (como a UI de saldos faz),
 *  mas só nos grupos onde a pessoa pode mesmo aparecer — membro com conta,
 *  ou dona de um placeholder reclamado nesse grupo (`placeholders.claimed_by`,
 *  indexado) — em vez de todos os meus grupos. Isto mantém a correção do
 *  código antigo, só substituindo "todos os grupos × todas as despesas da
 *  app" por consultas indexadas (`group_id`) restritas aos grupos
 *  realmente partilhados com esta pessoa. Tudo dentro da função assíncrona
 *  da query — fora do caminho síncrono de render (Fase 14). */
export function useSharedExpenses(
  userId: string | undefined,
  otherUserId: string | undefined,
): SharedExpenseEntry[] | undefined {
  const groups = useGroups(userId);

  return useCachedLiveQuery(`sharedExpenses:${userId ?? ''}:${otherUserId ?? ''}`, async () => {
    if (!userId || !otherUserId || !groups) return [];

    const claimedElsewhere = await db.placeholders.where('claimed_by').equals(otherUserId).toArray();
    const claimedGroupIds = new Set(claimedElsewhere.map((p) => p.group_id));
    const candidateGroups = groups.filter(
      (g) => g.members.includes(otherUserId) || claimedGroupIds.has(g.id),
    );

    const [groupEntries, myExpenses, users] = await Promise.all([
      Promise.all(candidateGroups.map(async (group) => {
        const [expenses, placeholders] = await Promise.all([
          db.expenses.where('group_id').equals(group.id).toArray(),
          db.placeholders.where('group_id').equals(group.id).toArray(),
        ]);
        const parties = buildPartyMap(groupMembersFromExpand(group), placeholders);
        const resolve = (id: string) => canonicalPartyId(id, parties);
        return expenses
          .filter((e) => !e.deleted_at)
          .filter((e) => {
            const ids = new Set([...e.payers.map((p) => resolve(p.party)), ...e.shares.map((s) => resolve(s.party))]);
            return ids.has(userId) && ids.has(otherUserId);
          })
          .map((expense) => ({ expense, groupName: group.name }));
      })),
      db.expenses.where('participants').equals(userId).toArray(),
      db.users.toArray(),
    ]);

    const byId = usersMap(users);
    const directEntries = myExpenses
      .filter((e) => !e.group_id && !e.deleted_at && e.participants?.includes(otherUserId))
      .map((expense) => ({ expense, groupName: null as string | null }));

    return [...groupEntries.flat(), ...directEntries]
      .map((entry) => ({ ...entry, expense: overlayUsers(entry.expense, byId) }))
      .sort((a, b) => compareExpensesRecentFirst(a.expense, b.expense));
  }, [userId, otherUserId, groups]);
}
