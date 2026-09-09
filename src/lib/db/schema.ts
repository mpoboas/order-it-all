import Dexie, { type Table } from 'dexie';
import type { Group, Trip, Order, Item, Split } from '@/lib/types';

/**
 * Cache local-first (IndexedDB via Dexie). As leituras da app saem daqui através
 * dos hooks reativos (`useLiveQuery`); o `SyncProvider` mantém as tabelas em dia
 * a partir do PocketBase (hidratação inicial + realtime + catch-up).
 *
 * As escritas continuam a ir sempre online — o Dexie é só a cache de leitura.
 */

export type SyncCollection = 'groups' | 'trips' | 'orders' | 'items' | 'splits';

export const SYNC_COLLECTIONS: SyncCollection[] = [
  'groups',
  'trips',
  'orders',
  'items',
  'splits',
];

/** KV simples: `lastSync:<coll>` (watermark ISO) e `session:userId`. */
export interface MetaRow {
  key: string;
  value: string | null;
}

class OrderItDB extends Dexie {
  groups!: Table<Group, string>;
  trips!: Table<Trip, string>;
  orders!: Table<Order, string>;
  items!: Table<Item, string>;
  splits!: Table<Split, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('orderit');
    // Índices a espelhar os filtros/sorts usados hoje nas páginas.
    this.version(1).stores({
      groups: 'id, *members, creator, created, updated',
      trips: 'id, group_id, status, created, updated',
      orders: 'id, trip_id, user, created, updated',
      items: 'id, order_id, created, updated',
      splits: 'id, group_id, created, updated',
      meta: 'key',
    });
  }
}

export const db = new OrderItDB();

export async function metaGet(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

export async function metaSet(key: string, value: string | null): Promise<void> {
  await db.meta.put({ key, value });
}

/** Apaga todos os dados em cache (troca de utilizador / logout). */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.groups, db.trips, db.orders, db.items, db.splits, db.meta],
    async () => {
      await Promise.all([
        db.groups.clear(),
        db.trips.clear(),
        db.orders.clear(),
        db.items.clear(),
        db.splits.clear(),
        db.meta.clear(),
      ]);
    },
  );
}
