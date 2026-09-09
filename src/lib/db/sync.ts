import type { Table } from 'dexie';
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import type { Group, Trip, Order, Item, Split } from '@/lib/types';
import {
  db,
  metaGet,
  metaSet,
  SYNC_COLLECTIONS,
  type SyncCollection,
} from './schema';

const EXPAND: Record<SyncCollection, string> = {
  groups: 'creator,admins,members',
  trips: 'created_by',
  orders: 'user,participants',
  items: '',
  splits: 'created_by',
};

type Syncable = { id: string; updated?: string };

function orFilter(field: string, ids: string[]): string {
  return ids.map((id) => `${field} = "${id}"`).join(' || ');
}

function tableFor(coll: SyncCollection): Table<Syncable, string> {
  return db[coll] as unknown as Table<Syncable, string>;
}

// --- Hidratação inicial: puxa o grafo do utilizador para o Dexie -------------

export async function hydrateAll(userId: string): Promise<void> {
  const since = new Date().toISOString();

  const groups = await pb.collection('groups').getFullList<Group>({
    filter: `members ~ "${userId}"`,
    sort: '-created',
    expand: EXPAND.groups,
  });
  const groupIds = groups.map((g) => g.id);

  const trips = groupIds.length
    ? await pb.collection('trips').getFullList<Trip>({
        filter: orFilter('group_id', groupIds),
        sort: '-created',
        expand: EXPAND.trips,
      })
    : [];
  const tripIds = trips.map((t) => t.id);

  const orders = tripIds.length
    ? await pb.collection('orders').getFullList<Order>({
        filter: orFilter('trip_id', tripIds),
        sort: '-created',
        expand: EXPAND.orders,
      })
    : [];
  const orderIds = orders.map((o) => o.id);

  const items = orderIds.length
    ? await pb.collection('items').getFullList<Item>({
        filter: orFilter('order_id', orderIds),
        sort: 'created',
      })
    : [];

  const splits = groupIds.length
    ? await pb.collection('splits').getFullList<Split>({
        filter: orFilter('group_id', groupIds),
        sort: '-created',
        expand: EXPAND.splits,
      })
    : [];

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
      ]);
      await db.groups.bulkPut(groups);
      await db.trips.bulkPut(trips);
      await db.orders.bulkPut(orders);
      await db.items.bulkPut(items);
      await db.splits.bulkPut(splits);
      for (const coll of SYNC_COLLECTIONS) {
        await metaSet(`lastSync:${coll}`, since);
      }
      await metaSet('session:userId', userId);
    },
  );
}

// --- Catch-up: apanha o que mudou/foi apagado enquanto estávamos fora --------

async function syncCollection(
  coll: SyncCollection,
  scopeFilter: string,
): Promise<void> {
  const table = tableFor(coll);
  const expand = EXPAND[coll];
  const since = new Date().toISOString();
  const lastSync = await metaGet(`lastSync:${coll}`);

  // 1. Registos criados/alterados desde o último sync.
  if (scopeFilter) {
    const changedFilter = lastSync
      ? `(${scopeFilter}) && updated >= "${lastSync}"`
      : scopeFilter;
    const changed = await pb.collection(coll).getFullList<Syncable>({
      filter: changedFilter,
      ...(expand ? { expand } : {}),
    });
    if (changed.length) {
      await table.bulkPut(changed);
    }
  }

  // 2. Reconciliação de apagados: o PocketBase faz hard-delete, por isso um
  //    delete que aconteça com a app fechada não chega pelo realtime.
  const serverIds = scopeFilter
    ? (
        await pb.collection(coll).getFullList<{ id: string }>({
          filter: scopeFilter,
          fields: 'id',
        })
      ).map((r) => r.id)
    : [];
  const serverIdSet = new Set(serverIds);
  const localIds = (await table.toCollection().primaryKeys()) as string[];
  const stale = localIds.filter((id) => !serverIdSet.has(id));
  if (stale.length) {
    await table.bulkDelete(stale);
  }

  await metaSet(`lastSync:${coll}`, since);
}

let catchUpInFlight: Promise<void> | null = null;

export function catchUp(): Promise<void> {
  if (catchUpInFlight) return catchUpInFlight;
  catchUpInFlight = runCatchUp().finally(() => {
    catchUpInFlight = null;
  });
  return catchUpInFlight;
}

async function runCatchUp(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const userId = pb.authStore.model?.id;
  if (!userId) return;

  await syncCollection('groups', `members ~ "${userId}"`);
  const groupIds = (await db.groups.toCollection().primaryKeys()) as string[];

  await syncCollection('trips', orFilter('group_id', groupIds));
  await syncCollection('splits', orFilter('group_id', groupIds));
  const tripIds = (await db.trips.toCollection().primaryKeys()) as string[];

  await syncCollection('orders', orFilter('trip_id', tripIds));
  const orderIds = (await db.orders.toCollection().primaryKeys()) as string[];

  await syncCollection('items', orFilter('order_id', orderIds));

  // Limpa órfãos deixados por um pai que saiu de âmbito (ex.: sair de um grupo).
  const groupIdSet = new Set(groupIds);
  const tripIdSet = new Set(tripIds);
  const orderIdSet = new Set(orderIds);
  await db.transaction('rw', [db.trips, db.splits, db.orders, db.items], async () => {
    await db.trips.filter((t) => !groupIdSet.has(t.group_id)).delete();
    await db.splits.filter((s) => !groupIdSet.has(s.group_id)).delete();
    await db.orders.filter((o) => !tripIdSet.has(o.trip_id)).delete();
    await db.items.filter((i) => !orderIdSet.has(i.order_id)).delete();
  });
}

// --- Realtime: uma subscrição por coleção para a sessão inteira --------------

let realtimeUnsubs: UnsubscribeFunc[] = [];

function isInScope(coll: SyncCollection, record: Record<string, unknown>): Promise<boolean> {
  switch (coll) {
    case 'groups': {
      const members = (record.members as string[] | undefined) ?? [];
      return Promise.resolve(members.includes(pb.authStore.model?.id ?? ''));
    }
    case 'trips':
    case 'splits':
      return db.groups.get(record.group_id as string).then(Boolean);
    case 'orders':
      return db.trips.get(record.trip_id as string).then(Boolean);
    case 'items':
      return db.orders.get(record.order_id as string).then(Boolean);
  }
}

function subscribeCollection(coll: SyncCollection): Promise<UnsubscribeFunc> {
  const table = tableFor(coll);
  const expand = EXPAND[coll];

  const handler = async (e: RecordSubscription<Syncable & Record<string, unknown>>) => {
    try {
      if (e.action === 'delete') {
        await table.delete(e.record.id);
        return;
      }
      if (!(await isInScope(coll, e.record))) return;
      const local = (await table.get(e.record.id)) as Syncable | undefined;
      // O eco de uma escrita optimista pode chegar "atrasado" — só aplica se
      // não fizer recuar o registo local.
      if (local?.updated && e.record.updated && e.record.updated < local.updated) {
        return;
      }
      await table.put(e.record);
    } catch (err) {
      console.error(`[sync] realtime ${coll} handler failed`, err);
    }
  };

  return pb.collection(coll).subscribe('*', handler, expand ? { expand } : undefined);
}

let realtimeStarting = false;

export async function startRealtime(): Promise<void> {
  if (realtimeUnsubs.length || realtimeStarting) return;
  realtimeStarting = true;
  try {
    const results = await Promise.allSettled(
      SYNC_COLLECTIONS.map(subscribeCollection),
    );
    realtimeUnsubs = results.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value] : [],
    );
    const failed = SYNC_COLLECTIONS.filter(
      (_, i) => results[i].status === 'rejected',
    );
    if (failed.length) {
      // O realtime do PocketBase pode devolver 403 durante uma reconexão com o
      // clientId ainda em trânsito. Tenta de novo daqui a pouco.
      console.warn('[sync] realtime subscribe falhou:', failed, '— retry em 5s');
      setTimeout(() => {
        stopRealtime();
        void startRealtime();
      }, 5000);
    }
  } finally {
    realtimeStarting = false;
  }
}

export function stopRealtime(): void {
  for (const unsub of realtimeUnsubs) {
    try {
      unsub();
    } catch {
      /* noop */
    }
  }
  realtimeUnsubs = [];
}
