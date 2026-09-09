'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Group, Trip, Order, Item, Split, User } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';
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

const SINGLE_USER_KEYS = ['creator', 'created_by', 'user'] as const;
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
