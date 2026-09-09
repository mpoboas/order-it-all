import type { Table } from 'dexie';
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import type { Group, Trip, Order, Item, Split, User } from '@/lib/types';
import {
  db,
  extractUsersFromExpand,
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

/** Sobreposição no filtro de `updated` para absorver ordem de commit / skew. */
const OVERLAP_MINUTES = 2;

type Syncable = { id: string; updated?: string; expand?: Record<string, unknown> };

function orFilter(field: string, ids: string[]): string {
  return ids.map((id) => `${field} = "${id}"`).join(' || ');
}

function tableFor(coll: SyncCollection): Table<Syncable, string> {
  return db[coll] as unknown as Table<Syncable, string>;
}

// --- Watermark server-authoritative ----------------------------------------
// Nunca usamos o relógio do cliente. A marca de cada coleção é o `updated` mais
// alto que vimos de facto (hora do servidor), e o filtro recua `OVERLAP_MINUTES`.

function maxUpdated(records: Syncable[], floor: string | null): string | null {
  let max = floor;
  for (const r of records) {
    if (r.updated && (!max || r.updated > max)) max = r.updated;
  }
  return max;
}

/** ISO/PB datetime menos N minutos, no formato que o filtro do PocketBase aceita. */
function withOverlap(iso: string | null, minutes = OVERLAP_MINUTES): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.replace(' ', 'T'));
  if (Number.isNaN(t)) return iso;
  return new Date(t - minutes * 60_000).toISOString().replace('T', ' ');
}

// --- Utilizadores embebidos no `expand` -> tabela `users` -------------------

async function putUsers(users: User[]): Promise<void> {
  if (users.length) await db.users.bulkPut(users);
}

/** IDs de utilizadores referenciados por tudo o que está em cache. */
async function referencedUserIds(): Promise<string[]> {
  const [groups, trips, orders, splits] = await Promise.all([
    db.groups.toArray(),
    db.trips.toArray(),
    db.orders.toArray(),
    db.splits.toArray(),
  ]);
  const s = new Set<string>();
  for (const g of groups) {
    if (g.creator) s.add(g.creator);
    g.members?.forEach((x) => s.add(x));
    g.admins?.forEach((x) => s.add(x));
  }
  for (const t of trips) if (t.created_by) s.add(t.created_by);
  for (const o of orders) {
    if (o.user) s.add(o.user);
    o.participants?.forEach((x) => s.add(x));
  }
  for (const sp of splits) if (sp.created_by) s.add(sp.created_by);
  return [...s];
}

/** Popula a tabela `users` a partir do `expand` já em cache (sem rede). Para
 *  clientes que migraram de v1 antes de existir a tabela `users`. */
export async function backfillUsersFromCache(): Promise<void> {
  const records = (
    await Promise.all([
      db.groups.toArray(),
      db.trips.toArray(),
      db.orders.toArray(),
      db.splits.toArray(),
    ])
  ).flat();
  await putUsers(extractUsersFromExpand(records));
}

// A coleção `users` do PocketBase não permite subscrições realtime úteis (List
// rule só te devolve a ti; subscrição por id → 404). Freshness dos utilizadores:
//  - imediata quando essa pessoa mexe num registo partilhado (o `expand` desse
//    registo é re-extraído — ver os handlers realtime das outras coleções);
//  - GET-by-id (View rule permite) no catch-up: `fetchMissingUsers` sempre;
//    `refreshAllUsers` no modo pesado (pull-to-refresh / reconexão / online).

async function getUsersByIds(ids: string[]): Promise<User[]> {
  const fetched = await Promise.all(
    ids.map((id) => pb.collection('users').getOne<User>(id).catch(() => null)),
  );
  return fetched.filter((u): u is User => u !== null);
}

/** Vai buscar só os referenciados que ainda não estão em cache (novo membro). */
async function fetchMissingUsers(): Promise<void> {
  const want = await referencedUserIds();
  const have = new Set(
    (await db.users.toCollection().primaryKeys()) as string[],
  );
  const missing = want.filter((id) => !have.has(id));
  if (missing.length) await putUsers(await getUsersByIds(missing));
}

/** Re-obtém TODOS os referenciados (apanha renomes). Só no modo pesado. */
async function refreshAllUsers(): Promise<void> {
  const ids = await referencedUserIds();
  if (ids.length) await putUsers(await getUsersByIds(ids));
}

// --- Hidratação inicial: puxa o grafo do utilizador para o Dexie -----------

export async function hydrateAll(userId: string): Promise<void> {
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

  const users = extractUsersFromExpand([...groups, ...trips, ...orders, ...splits]);

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
      ]);
      await db.groups.bulkPut(groups);
      await db.trips.bulkPut(trips);
      await db.orders.bulkPut(orders);
      await db.items.bulkPut(items);
      await db.splits.bulkPut(splits);
      await db.users.bulkPut(users);

      const watermarks: Record<SyncCollection | 'users', string | null> = {
        groups: maxUpdated(groups, null),
        trips: maxUpdated(trips, null),
        orders: maxUpdated(orders, null),
        items: maxUpdated(items, null),
        splits: maxUpdated(splits, null),
        users: maxUpdated(users, null),
      };
      for (const [coll, mark] of Object.entries(watermarks)) {
        if (mark) await metaSet(`lastSync:${coll}`, mark);
      }
      await metaSet('session:userId', userId);
    },
  );
}

// --- Catch-up: apanha o que mudou/foi apagado enquanto estávamos fora ------

interface SyncOpts {
  /** Reconciliar apagados (lista de IDs do servidor). Caro — só no
   *  pull-to-refresh, na reconexão e no heartbeat lento. */
  reconcileDeletes?: boolean;
  /** GET-by-id de todos os utilizadores referenciados (apanha renomes perdidos
   *  com o realtime em baixo). Só no pull-to-refresh e na reconexão. */
  refreshUsers?: boolean;
}

function mergeOpts(a: SyncOpts, b: SyncOpts): SyncOpts {
  return {
    reconcileDeletes: !!(a.reconcileDeletes || b.reconcileDeletes),
    refreshUsers: !!(a.refreshUsers || b.refreshUsers),
  };
}

function covers(current: SyncOpts, wanted: SyncOpts): boolean {
  return (
    (!wanted.reconcileDeletes || !!current.reconcileDeletes) &&
    (!wanted.refreshUsers || !!current.refreshUsers)
  );
}

async function syncCollection(
  coll: SyncCollection,
  scopeFilter: string,
  opts: SyncOpts,
): Promise<void> {
  const table = tableFor(coll);
  const expand = EXPAND[coll];
  const lastSync = await metaGet(`lastSync:${coll}`);

  // 1. Registos criados/alterados desde o último sync (com sobreposição).
  if (scopeFilter) {
    const changedFilter = lastSync
      ? `(${scopeFilter}) && updated >= "${withOverlap(lastSync)}"`
      : scopeFilter;
    const changed = await pb.collection(coll).getFullList<Syncable>({
      filter: changedFilter,
      ...(expand ? { expand } : {}),
    });
    if (changed.length) {
      await table.bulkPut(changed);
      await putUsers(extractUsersFromExpand(changed));
    }
    const next = maxUpdated(changed, lastSync);
    if (next) await metaSet(`lastSync:${coll}`, next);
  }

  // 2. Reconciliação de apagados: o PocketBase faz hard-delete, por isso um
  //    delete com a app fechada não chega pelo realtime.
  if (opts.reconcileDeletes && scopeFilter) {
    const serverIds = new Set(
      (
        await pb.collection(coll).getFullList<{ id: string }>({
          filter: scopeFilter,
          fields: 'id',
        })
      ).map((r) => r.id),
    );
    const localIds = (await table.toCollection().primaryKeys()) as string[];
    const stale = localIds.filter((id) => !serverIds.has(id));
    if (stale.length) await table.bulkDelete(stale);
  }
}

// Single-flight + no máximo um em fila. Um pedido novo enquanto corre um sync
// junta-se ao que corre se este já cobrir o que pede; senão fica em fila, com
// as flags coalescidas.
let running: Promise<void> | null = null;
let runningOpts: SyncOpts = {};
let queuedOpts: SyncOpts | null = null;
let queuedPromise: Promise<void> | null = null;
let resolveQueued: (() => void) | null = null;

export function catchUp(opts: SyncOpts = {}): Promise<void> {
  if (!running) {
    runningOpts = opts;
    running = withRetryOnce(() => runCatchUp(opts))
      .catch((err) => console.error('[sync] catchUp falhou', err))
      .finally(() => {
        running = null;
        drainQueue();
      });
    return running;
  }

  if (covers(runningOpts, opts)) return running;

  queuedOpts = queuedOpts ? mergeOpts(queuedOpts, opts) : opts;
  if (!queuedPromise) {
    queuedPromise = new Promise((res) => {
      resolveQueued = res;
    });
  }
  return queuedPromise;
}

function drainQueue(): void {
  if (!queuedOpts) return;
  const opts = queuedOpts;
  const done = resolveQueued;
  queuedOpts = null;
  queuedPromise = null;
  resolveQueued = null;
  runningOpts = opts;
  running = withRetryOnce(() => runCatchUp(opts))
    .catch((err) => console.error('[sync] catchUp falhou', err))
    .finally(() => {
      running = null;
      done?.();
      drainQueue();
    });
}

async function withRetryOnce(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn('[sync] catchUp — retry único', err);
    await new Promise((r) => setTimeout(r, 1000));
    await fn();
  }
}

async function runCatchUp(opts: SyncOpts): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const userId = pb.authStore.model?.id;
  if (!userId) return;

  await syncCollection('groups', `members ~ "${userId}"`, opts);
  const groupIds = (await db.groups.toCollection().primaryKeys()) as string[];

  await syncCollection('trips', orFilter('group_id', groupIds), opts);
  await syncCollection('splits', orFilter('group_id', groupIds), opts);
  const tripIds = (await db.trips.toCollection().primaryKeys()) as string[];

  await syncCollection('orders', orFilter('trip_id', tripIds), opts);
  const orderIds = (await db.orders.toCollection().primaryKeys()) as string[];

  await syncCollection('items', orFilter('order_id', orderIds), opts);

  // Utilizadores: garante os referenciados em falta; no modo pesado re-obtém
  // todos (apanha renomes).
  await fetchMissingUsers();
  if (opts.refreshUsers) await refreshAllUsers();

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

/**
 * Pull-to-refresh / "põe tudo fresco". NÃO faz full re-download — corre o sync
 * incremental com reconciliação de apagados e re-arma o realtime se caiu.
 */
export async function fullResync(): Promise<void> {
  await ensureRealtime();
  await catchUp({ reconcileDeletes: true, refreshUsers: true });
}

// --- Realtime: uma subscrição por coleção para a sessão inteira -----------

let realtimeUnsubs: UnsubscribeFunc[] = [];
let realtimeStarting = false;
let connectSeen = 0;

function isInScope(
  coll: SyncCollection,
  record: Record<string, unknown>,
): Promise<boolean> {
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
      await putUsers(extractUsersFromExpand([e.record]));
    } catch (err) {
      console.error(`[sync] realtime ${coll} handler failed`, err);
    }
  };

  return pb.collection(coll).subscribe('*', handler, expand ? { expand } : undefined);
}

export async function startRealtime(): Promise<void> {
  if (realtimeUnsubs.length || realtimeStarting) return;
  realtimeStarting = true;
  try {
    // RESYNC em cada (re)ligação — o PocketBase não reenvia o backlog de eventos
    // perdidos durante uma queda de ligação.
    const connectUnsub = await pb.realtime.subscribe('PB_CONNECT', () => {
      connectSeen += 1;
      if (connectSeen > 1) {
        void catchUp({ reconcileDeletes: true, refreshUsers: true });
      }
    });

    const results = await Promise.allSettled(
      SYNC_COLLECTIONS.map(subscribeCollection),
    );
    realtimeUnsubs = [
      connectUnsub,
      ...results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    ];

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) {
      console.warn(`[sync] ${failed} subscrições realtime falharam — retry em 5s`);
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
  connectSeen = 0;
}

/** Garante que o realtime está ligado e vivo (usado pelo pull-to-refresh). */
export async function ensureRealtime(): Promise<void> {
  if (!realtimeUnsubs.length) {
    await startRealtime();
    return;
  }
  if (!pb.realtime.isConnected) {
    stopRealtime();
    await startRealtime();
  }
}
