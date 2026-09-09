'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Group, Trip, Order, Item, Split } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';
import { db } from './schema';

/**
 * Wrappers finos de `useLiveQuery` com o mesmo filtro/sort que as páginas usavam
 * nos `getFullList`. Devolvem `undefined` enquanto a primeira query não resolve
 * (útil para distinguir "ainda a carregar" de "vazio").
 */

const byCreatedDesc = <T extends { created: string }>(a: T, b: T) =>
  b.created.localeCompare(a.created);

export function useGroups(userId: string | undefined): Group[] | undefined {
  return useLiveQuery(async () => {
    if (!userId) return [];
    const all = await db.groups.toArray();
    return all
      .filter((g) => g.members?.includes(userId))
      .sort(byCreatedDesc);
  }, [userId]);
}

export function useGroup(groupId: string | undefined): Group | undefined | null {
  return useLiveQuery(
    () => (groupId ? db.groups.get(groupId).then((g) => g ?? null) : null),
    [groupId],
  );
}

export function useTrips(groupId: string | undefined): Trip[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    const trips = await db.trips.where('group_id').equals(groupId).toArray();
    return trips.sort(byCreatedDesc);
  }, [groupId]);
}

export function useTrip(tripId: string | undefined): Trip | undefined | null {
  return useLiveQuery(
    () => (tripId ? db.trips.get(tripId).then((t) => t ?? null) : null),
    [tripId],
  );
}

export function useOrders(tripId: string | undefined): Order[] | undefined {
  return useLiveQuery(async () => {
    if (!tripId) return [];
    const orders = await db.orders.where('trip_id').equals(tripId).toArray();
    return orders.sort(byCreatedDesc);
  }, [tripId]);
}

export function useItems(orderIds: string[]): Item[] | undefined {
  const key = orderIds.join(',');
  return useLiveQuery(async () => {
    if (!orderIds.length) return [];
    const items = await db.items.where('order_id').anyOf(orderIds).toArray();
    return items.sort((a, b) => a.created.localeCompare(b.created));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function useSplits(groupId: string | undefined): Split[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    const splits = await db.splits.where('group_id').equals(groupId).toArray();
    return splits.sort(byCreatedDesc).map(normalizeSplitRecord);
  }, [groupId]);
}

export function useSplit(splitId: string | undefined): Split | undefined | null {
  return useLiveQuery(
    () =>
      splitId
        ? db.splits.get(splitId).then((s) => (s ? normalizeSplitRecord(s) : null))
        : null,
    [splitId],
  );
}
