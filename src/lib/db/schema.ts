import Dexie, { type Table } from 'dexie';
import type { Group, Trip, Order, Item, Split, User } from '@/lib/types';

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

// --- Utilizadores embebidos no `expand` -----------------------------------

const SINGLE_USER_KEYS = ['creator', 'created_by', 'user'] as const;
const ARRAY_USER_KEYS = ['members', 'admins', 'participants'] as const;

function looksLikeUser(v: unknown): v is User {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { id?: unknown }).id === 'string' &&
    typeof (v as { name?: unknown }).name === 'string'
  );
}

/** Extrai todos os User objects do `expand` de um lote de registos. */
export function extractUsersFromExpand(
  records: Array<{ expand?: Record<string, unknown> }>,
): User[] {
  const byId = new Map<string, User>();
  for (const rec of records) {
    const expand = rec.expand;
    if (!expand) continue;
    for (const key of SINGLE_USER_KEYS) {
      const v = expand[key];
      if (looksLikeUser(v)) byId.set(v.id, v);
    }
    for (const key of ARRAY_USER_KEYS) {
      const v = expand[key];
      if (Array.isArray(v)) {
        for (const u of v) if (looksLikeUser(u)) byId.set(u.id, u);
      }
    }
  }
  return [...byId.values()];
}

class OrderItDB extends Dexie {
  groups!: Table<Group, string>;
  trips!: Table<Trip, string>;
  orders!: Table<Order, string>;
  items!: Table<Item, string>;
  splits!: Table<Split, string>;
  users!: Table<User, string>;
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
    // v2: tabela `users` normalizada — os nomes/avatares deixam de viver só
    // embebidos no `expand` dos registos (que ficava desatualizado). Os hooks
    // sobrepõem os utilizadores frescos por cima do `expand` do servidor.
    this.version(2)
      .stores({ users: 'id, updated' })
      .upgrade(async (tx) => {
        // Back-fill a partir do `expand` já em cache — sem rede.
        const records = (
          await Promise.all(
            ['groups', 'trips', 'orders', 'splits'].map((t) =>
              tx.table(t).toArray(),
            ),
          )
        ).flat();
        const users = extractUsersFromExpand(records);
        if (users.length) await tx.table('users').bulkPut(users);
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
    [db.groups, db.trips, db.orders, db.items, db.splits, db.users, db.meta],
    async () => {
      await Promise.all([
        db.groups.clear(),
        db.trips.clear(),
        db.orders.clear(),
        db.items.clear(),
        db.splits.clear(),
        db.users.clear(),
        db.meta.clear(),
      ]);
    },
  );
}
