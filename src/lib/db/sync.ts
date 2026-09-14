import type { Table } from 'dexie';
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import type { Group, User, Expense, Placeholder, ExpenseComment } from '@/lib/types';
import { db, extractUsersFromExpand, metaGet, metaSet } from './schema';

/**
 * Sincronização local-first, com **âmbito por grupo**.
 *
 *  - A lista de `groups` sincroniza globalmente (é pequena e está sempre visível).
 *  - `expenses` / `placeholders` sincronizam **globalmente** também (todos os
 *    grupos do utilizador, não só o ativo) — a home e a Atividade precisam dos
 *    saldos de todos os grupos, e são registos pequenos (ao contrário de
 *    trips/orders/items).
 *  - `trips` / `orders` / `items` / `splits` sincronizam só para o **grupo ativo**
 *    (o que está aberto), via filtros relacionais do PocketBase — sem cadeias de
 *    `OR` (que rebentavam a 400 em utilizadores com muitos dados) e sem puxar o
 *    grafo inteiro. O Dexie mantém em cache os grupos já visitados.
 *  - Realtime: 1 subscrição filtrada por coleção para o grupo ativo (as
 *    subscrições `*` sem filtro dão 403 em `items`/`orders`), mais 1 subscrição
 *    global por coleção global (`groups`, `expenses`, `placeholders`).
 */

const OVERLAP_MINUTES = 2;

type GroupColl = 'trips' | 'splits' | 'orders' | 'items';
const GROUP_COLLS: GroupColl[] = ['trips', 'splits', 'orders', 'items'];

const GROUP_EXPAND: Record<GroupColl, string> = {
  trips: 'created_by',
  orders: 'user,participants',
  items: '',
  splits: 'created_by',
};

const GROUPS_EXPAND = 'creator,admins,members';

type GlobalColl = 'expenses' | 'placeholders' | 'expense_comments';
const GLOBAL_COLLS: GlobalColl[] = ['expenses', 'placeholders', 'expense_comments'];

const GLOBAL_EXPAND: Record<GlobalColl, string> = {
  expenses: 'created_by,updated_by,deleted_by',
  placeholders: 'claimed_by,created_by',
  expense_comments: 'user',
};

type Syncable = { id: string; updated?: string; expand?: Record<string, unknown> };

/** Filtro relacional que restringe uma coleção a UM grupo. */
function groupScope(coll: GroupColl, gid: string): string {
  switch (coll) {
    case 'trips':
    case 'splits':
      return `group_id = "${gid}"`;
    case 'orders':
      return `trip_id.group_id = "${gid}"`;
    case 'items':
      return `order_id.trip_id.group_id = "${gid}"`;
  }
}

function groupTable(coll: GroupColl): Table<Syncable, string> {
  return db[coll] as unknown as Table<Syncable, string>;
}

function globalTable(coll: GlobalColl): Table<Syncable, string> {
  return db[coll] as unknown as Table<Syncable, string>;
}

// --- Watermark server-authoritative --------------------------------------

function maxUpdated(records: Syncable[], floor: string | null): string | null {
  let max = floor;
  for (const r of records) {
    if (r.updated && (!max || r.updated > max)) max = r.updated;
  }
  return max;
}

function withOverlap(iso: string | null, minutes = OVERLAP_MINUTES): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.replace(' ', 'T'));
  if (Number.isNaN(t)) return iso;
  return new Date(t - minutes * 60_000).toISOString().replace('T', ' ');
}

// --- Utilizadores --------------------------------------------------------

async function putUsers(users: User[]): Promise<void> {
  if (users.length) await db.users.bulkPut(users);
}

export async function backfillUsersFromCache(): Promise<void> {
  const records = (
    await Promise.all([
      db.groups.toArray(),
      db.trips.toArray(),
      db.orders.toArray(),
      db.splits.toArray(),
      db.expenses.toArray(),
      db.placeholders.toArray(),
      db.expense_comments.toArray(),
    ])
  ).flat();
  await putUsers(extractUsersFromExpand(records));
}

async function referencedUserIds(): Promise<string[]> {
  const [groups, trips, orders, splits, expenses, placeholders, comments] = await Promise.all([
    db.groups.toArray(),
    db.trips.toArray(),
    db.orders.toArray(),
    db.splits.toArray(),
    db.expenses.toArray(),
    db.placeholders.toArray(),
    db.expense_comments.toArray(),
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
  for (const e of expenses) {
    if (e.created_by) s.add(e.created_by);
    if (e.updated_by) s.add(e.updated_by);
    if (e.deleted_by) s.add(e.deleted_by);
  }
  for (const p of placeholders) {
    if (p.created_by) s.add(p.created_by);
    if (p.claimed_by) s.add(p.claimed_by);
  }
  for (const c of comments) if (c.user) s.add(c.user);
  return [...s];
}

// A coleção `users` não permite realtime útil (List rule restrita; subscrição
// por id → 404). View rule permite GET-by-id: usamos isso no catch-up.
async function getUsersByIds(ids: string[]): Promise<User[]> {
  const fetched = await Promise.all(
    ids.map((id) => pb.collection('users').getOne<User>(id).catch(() => null)),
  );
  return fetched.filter((u): u is User => u !== null);
}

async function fetchMissingUsers(): Promise<void> {
  const want = await referencedUserIds();
  const have = new Set((await db.users.toCollection().primaryKeys()) as string[]);
  const missing = want.filter((id) => !have.has(id));
  if (missing.length) await putUsers(await getUsersByIds(missing));
}


// --- Groups (global) ---------------------------------------------------

export async function hydrateGroups(userId: string): Promise<void> {
  const globalScope = `group_id.members ~ "${userId}"`;
  const [groups, expenses, placeholders, comments] = await Promise.all([
    pb.collection('groups').getFullList<Group>({
      filter: `members ~ "${userId}"`,
      sort: '-created',
      expand: GROUPS_EXPAND,
    }),
    pb.collection('expenses').getFullList<Expense>({
      filter: globalScope,
      expand: GLOBAL_EXPAND.expenses,
    }),
    pb.collection('placeholders').getFullList<Placeholder>({
      filter: globalScope,
      expand: GLOBAL_EXPAND.placeholders,
    }),
    pb.collection('expense_comments').getFullList<ExpenseComment>({
      filter: globalScope,
      expand: GLOBAL_EXPAND.expense_comments,
    }),
  ]);
  await db.transaction(
    'rw',
    [db.groups, db.users, db.meta, db.expenses, db.placeholders, db.expense_comments],
    async () => {
      await db.groups.clear();
      await db.groups.bulkPut(groups);
      await db.expenses.clear();
      await db.expenses.bulkPut(expenses);
      await db.placeholders.clear();
      await db.placeholders.bulkPut(placeholders);
      await db.expense_comments.clear();
      await db.expense_comments.bulkPut(comments);
      await putUsers(extractUsersFromExpand([...groups, ...expenses, ...placeholders, ...comments]));
      const mark = maxUpdated(groups, null);
      if (mark) await metaSet('lastSync:groups', mark);
      const expMark = maxUpdated(expenses, null);
      if (expMark) await metaSet('lastSync:global:expenses', expMark);
      const phMark = maxUpdated(placeholders, null);
      if (phMark) await metaSet('lastSync:global:placeholders', phMark);
      const cMark = maxUpdated(comments, null);
      if (cMark) await metaSet('lastSync:global:expense_comments', cMark);
      await metaSet('session:userId', userId);
    },
  );
}

async function syncGroups(opts: SyncOpts): Promise<void> {
  const userId = pb.authStore.model?.id;
  if (!userId) return;
  const scope = `members ~ "${userId}"`;
  const lastSync = await metaGet('lastSync:groups');

  // A lista de grupos é pequena e está sempre visível. O sync normal é
  // incremental (`updated >= lastSync`), mas isso não recupera um grupo que
  // escapou à hidratação inicial (corrida no registo, filtro relacional do PB,
  // convite aceite depois) e cujo `updated` não mexeu desde então. Nesses
  // gatilhos (pull-to-refresh, reconexão, volta de rede) puxamos a lista
  // **completa** — poucos KB — para a cache se auto-corrigir.
  const full = opts.fullGroups || !lastSync;

  const records = await pb.collection('groups').getFullList<Group>({
    filter: full ? scope : `(${scope}) && updated >= "${withOverlap(lastSync)}"`,
    expand: GROUPS_EXPAND,
  });
  if (records.length) {
    await db.groups.bulkPut(records);
    await putUsers(extractUsersFromExpand(records));
  }
  const mark = maxUpdated(records, lastSync);
  if (mark) await metaSet('lastSync:groups', mark);

  // Reconciliação de apagados. Com a lista completa em mão, a verdade do
  // servidor são os próprios `records` — dispensa o pedido extra só de ids.
  if (opts.reconcileDeletes && (full || lastSync)) {
    const serverIds = full
      ? new Set(records.map((r) => r.id))
      : new Set(
          (
            await pb.collection('groups').getFullList<{ id: string }>({
              filter: scope,
              fields: 'id',
            })
          ).map((r) => r.id),
        );
    const localIds = (await db.groups.toCollection().primaryKeys()) as string[];
    const stale = localIds.filter((id) => !serverIds.has(id));
    if (stale.length) {
      await db.groups.bulkDelete(stale);
      for (const gid of stale) await dropGroupData(gid);
    }
  }
}

/**
 * Sync incremental (watermark global, não por grupo — `expenses`/`placeholders`
 * são pequenos e cobrem TODOS os grupos do utilizador de uma vez).
 */
async function syncGlobalCollection(coll: GlobalColl, opts: SyncOpts): Promise<void> {
  const userId = pb.authStore.model?.id;
  if (!userId) return;
  const scope = `group_id.members ~ "${userId}"`;
  const wmKey = `lastSync:global:${coll}`;
  const lastSync = await metaGet(wmKey);
  const full = opts.fullGroups || !lastSync;
  const table = globalTable(coll);

  const changed = await pb.collection(coll).getFullList<Syncable>({
    filter: full ? scope : `(${scope}) && updated >= "${withOverlap(lastSync)}"`,
    expand: GLOBAL_EXPAND[coll],
  });
  if (changed.length) {
    await table.bulkPut(changed);
    await putUsers(extractUsersFromExpand(changed));
  }
  const mark = maxUpdated(changed, lastSync);
  if (mark) await metaSet(wmKey, mark);

  if (opts.reconcileDeletes && (full || lastSync)) {
    const serverIds = full
      ? new Set(changed.map((r) => r.id))
      : new Set(
          (
            await pb.collection(coll).getFullList<{ id: string }>({
              filter: scope,
              fields: 'id',
            })
          ).map((r) => r.id),
        );
    const localIds = (await table.toCollection().primaryKeys()) as string[];
    const stale = localIds.filter((id) => !serverIds.has(id));
    if (stale.length) await table.bulkDelete(stale);
  }
}

async function syncGlobalCollections(opts: SyncOpts): Promise<void> {
  for (const coll of GLOBAL_COLLS) await syncGlobalCollection(coll, opts);
}

/** Apaga da cache tudo o que pertence a um grupo (ao sair dele / ser removido). */
async function dropGroupData(gid: string): Promise<void> {
  const tripIds = (await db.trips.where('group_id').equals(gid).primaryKeys()) as string[];
  const orderIds = tripIds.length
    ? ((await db.orders.where('trip_id').anyOf(tripIds).primaryKeys()) as string[])
    : [];
  await db.transaction(
    'rw',
    [db.trips, db.splits, db.orders, db.items, db.expenses, db.placeholders, db.expense_comments],
    async () => {
      await db.trips.where('group_id').equals(gid).delete();
      await db.splits.where('group_id').equals(gid).delete();
      if (tripIds.length) await db.orders.where('trip_id').anyOf(tripIds).delete();
      if (orderIds.length) await db.items.where('order_id').anyOf(orderIds).delete();
      await db.expenses.where('group_id').equals(gid).delete();
      await db.placeholders.where('group_id').equals(gid).delete();
      await db.expense_comments.where('group_id').equals(gid).delete();
    },
  );
  for (const c of GROUP_COLLS) await db.meta.delete(`lastSync:g:${gid}:${c}`);
  groupSynced.delete(gid);
}

// --- Dados de um grupo -------------------------------------------------

async function localIdsInGroup(coll: GroupColl, gid: string): Promise<string[]> {
  if (coll === 'trips' || coll === 'splits') {
    return (await db[coll].where('group_id').equals(gid).primaryKeys()) as string[];
  }
  const tripIds = (await db.trips.where('group_id').equals(gid).primaryKeys()) as string[];
  if (!tripIds.length) return [];
  if (coll === 'orders') {
    return (await db.orders.where('trip_id').anyOf(tripIds).primaryKeys()) as string[];
  }
  const orderIds = (await db.orders.where('trip_id').anyOf(tripIds).primaryKeys()) as string[];
  if (!orderIds.length) return [];
  return (await db.items.where('order_id').anyOf(orderIds).primaryKeys()) as string[];
}

async function syncGroupCollection(
  coll: GroupColl,
  gid: string,
  opts: SyncOpts,
): Promise<void> {
  const table = groupTable(coll);
  const expand = GROUP_EXPAND[coll];
  const scope = groupScope(coll, gid);
  const wmKey = `lastSync:g:${gid}:${coll}`;
  const lastSync = await metaGet(wmKey);

  const changed = await pb.collection(coll).getFullList<Syncable>({
    filter: lastSync ? `(${scope}) && updated >= "${withOverlap(lastSync)}"` : scope,
    sort: coll === 'items' ? 'created' : '-created',
    ...(expand ? { expand } : {}),
  });
  if (changed.length) {
    await table.bulkPut(changed);
    await putUsers(extractUsersFromExpand(changed));
  }
  const mark = maxUpdated(changed, lastSync);
  if (mark) await metaSet(wmKey, mark);

  // Sem reconciliação na 1ª sync (o fetch acima já trouxe tudo).
  if (opts.reconcileDeletes && lastSync) {
    const serverIds = new Set(
      (
        await pb.collection(coll).getFullList<{ id: string }>({
          filter: scope,
          fields: 'id',
        })
      ).map((r) => r.id),
    );
    const localScoped = await localIdsInGroup(coll, gid);
    const stale = localScoped.filter((id) => !serverIds.has(id));
    if (stale.length) await table.bulkDelete(stale);
  }
}

const groupDataInFlight = new Map<string, Promise<void>>();

/** Single-flight por grupo — chamadas concorrentes juntam-se à que corre. */
function syncGroupData(gid: string, opts: SyncOpts): Promise<void> {
  const existing = groupDataInFlight.get(gid);
  if (existing) return existing;
  const p = runSyncGroupData(gid, opts).finally(() => {
    if (groupDataInFlight.get(gid) === p) groupDataInFlight.delete(gid);
  });
  groupDataInFlight.set(gid, p);
  return p;
}

async function runSyncGroupData(gid: string, opts: SyncOpts): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!pb.authStore.model?.id) return;
  for (const coll of GROUP_COLLS) {
    await syncGroupCollection(coll, gid, opts);
  }
}

// --- Catch-up (grupos + grupo ativo) --------------------------------------

interface SyncOpts {
  reconcileDeletes?: boolean;
  /** Puxa a lista de grupos completa (não o delta) — auto-corrige uma cache parcial. */
  fullGroups?: boolean;
}

function mergeOpts(a: SyncOpts, b: SyncOpts): SyncOpts {
  return {
    reconcileDeletes: !!(a.reconcileDeletes || b.reconcileDeletes),
    fullGroups: !!(a.fullGroups || b.fullGroups),
  };
}

function covers(current: SyncOpts, wanted: SyncOpts): boolean {
  return (
    (!wanted.reconcileDeletes || !!current.reconcileDeletes) &&
    (!wanted.fullGroups || !!current.fullGroups)
  );
}

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
  if (!pb.authStore.model?.id) return;

  await syncGroups(opts);
  await syncGlobalCollections(opts);
  if (activeGroupId) await syncGroupData(activeGroupId, opts);

  // Só vai buscar utilizadores que ainda não conhecemos (novos membros). Os
  // nomes/avatares dos que já conhecemos são refrescados pelo `expand` sempre
  // que um registo-pai muda.
  await fetchMissingUsers();
}

/**
 * Pull-to-refresh. O grupo ativo continua a sincronizar por delta (não puxa a
 * BD toda), mas a **lista de grupos vem completa** — é o único gesto explícito
 * do utilizador para "põe isto como deve estar", e tem de recuperar um grupo
 * que a hidratação inicial não trouxe. Mais reconciliação de apagados e re-arma
 * o realtime.
 */
export async function fullResync(): Promise<void> {
  await ensureRealtime();
  await catchUp({ reconcileDeletes: true, fullGroups: true });
}

// --- Grupo ativo + estado observável -----------------------------------

let activeGroupId: string | null = null;
let groupSyncing = false;
const groupSynced = new Set<string>();

let snapshot: { activeGroupId: string | null; groupSyncing: boolean } = {
  activeGroupId: null,
  groupSyncing: false,
};
const listeners = new Set<() => void>();

export const syncStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return snapshot;
  },
};

function publish(): void {
  snapshot = { activeGroupId, groupSyncing };
  for (const l of listeners) l();
}

let pendingClear: ReturnType<typeof setTimeout> | null = null;

/** Chamado pelo layout do grupo. Sincroniza os dados desse grupo e troca as
 *  subscrições realtime. O `null` (cleanup do efeito) é adiado para não lutar
 *  com o mount→unmount→mount do StrictMode / navegação A→B. */
export function setActiveGroup(gid: string | null): void {
  if (gid === null) {
    if (pendingClear) clearTimeout(pendingClear);
    pendingClear = setTimeout(() => {
      pendingClear = null;
      void applyActiveGroup(null);
    }, 150);
    return;
  }
  if (pendingClear) {
    clearTimeout(pendingClear);
    pendingClear = null;
  }
  void applyActiveGroup(gid);
}

async function applyActiveGroup(gid: string | null): Promise<void> {
  if (activeGroupId === gid) return;
  activeGroupId = gid;
  publish();

  await swapGroupRealtime(gid);
  if (!gid) return;

  if (!groupSynced.has(gid)) {
    groupSyncing = true;
    publish();
    try {
      await syncGroupData(gid, { reconcileDeletes: true });
      groupSynced.add(gid);
    } catch (err) {
      console.error('[sync] setActiveGroup', err);
    } finally {
      groupSyncing = false;
      publish();
    }
  } else {
    void syncGroupData(gid, {}).catch(() => {});
  }
}

/** Limpa o estado de sessão (logout / troca de utilizador). */
export function resetSyncState(): void {
  activeGroupId = null;
  groupSyncing = false;
  groupSynced.clear();
  publish();
}

// --- Realtime --------------------------------------------------------

let connectUnsub: UnsubscribeFunc | null = null;
let groupsUnsub: UnsubscribeFunc | null = null;
let globalUnsubs: UnsubscribeFunc[] = [];
let groupRtUnsubs: UnsubscribeFunc[] = [];
let connectSeen = 0;
let realtimeStarting = false;

const groupsHandler = async (e: RecordSubscription<Group & Syncable>) => {
  try {
    if (e.action === 'delete') {
      await db.groups.delete(e.record.id);
      await dropGroupData(e.record.id);
      return;
    }
    const local = await db.groups.get(e.record.id);
    if (local?.updated && e.record.updated && e.record.updated < local.updated) return;
    await db.groups.put(e.record);
    await putUsers(extractUsersFromExpand([e.record]));
  } catch (err) {
    console.error('[sync] realtime groups', err);
  }
};

function makeGroupHandler(coll: GroupColl) {
  return makeTableHandler(coll, groupTable(coll));
}

function makeGlobalHandler(coll: GlobalColl) {
  return makeTableHandler(coll, globalTable(coll));
}

function makeTableHandler(label: string, table: Table<Syncable, string>) {
  return async (e: RecordSubscription<Syncable>) => {
    try {
      if (e.action === 'delete') {
        await table.delete(e.record.id);
        return;
      }
      const local = (await table.get(e.record.id)) as Syncable | undefined;
      if (local?.updated && e.record.updated && e.record.updated < local.updated) {
        return;
      }
      await table.put(e.record);
      await putUsers(extractUsersFromExpand([e.record]));
    } catch (err) {
      console.error(`[sync] realtime ${label}`, err);
    }
  };
}

let groupRtGid: string | null = null;

let swapInFlight: Promise<void> | null = null;

function swapGroupRealtime(gid: string | null): Promise<void> {
  const run = (swapInFlight ?? Promise.resolve())
    .catch(() => {})
    .then(() => doSwapGroupRealtime(gid))
    .finally(() => {
      if (swapInFlight === run) swapInFlight = null;
    });
  swapInFlight = run;
  return run;
}

async function doSwapGroupRealtime(gid: string | null): Promise<void> {
  const alreadyRight =
    gid === groupRtGid &&
    groupRtUnsubs.length === (gid ? GROUP_COLLS.length : 0);
  if (alreadyRight) return;

  for (const u of groupRtUnsubs) {
    try {
      await u();
    } catch {
      /* noop */
    }
  }
  groupRtUnsubs = [];
  groupRtGid = null;

  // Sem SSE de grupos ainda (startRealtime a decorrer) ou sem grupo ativo:
  // sai sem marcar `groupRtGid`, para uma chamada posterior tentar de novo.
  if (!gid || !groupsUnsub) return;

  const results = await Promise.allSettled(
    GROUP_COLLS.map((coll) =>
      pb.collection(coll).subscribe('*', makeGroupHandler(coll), {
        filter: groupScope(coll, gid),
        ...(GROUP_EXPAND[coll] ? { expand: GROUP_EXPAND[coll] } : {}),
      }),
    ),
  );
  groupRtUnsubs = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  groupRtGid = groupRtUnsubs.length ? gid : null;
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) console.warn(`[sync] ${failed} subscrições de grupo falharam`);
}

export async function startRealtime(): Promise<void> {
  if (groupsUnsub || realtimeStarting) return;
  const userId = pb.authStore.model?.id;
  if (!userId) return;
  realtimeStarting = true;
  try {
    connectUnsub = await pb.realtime.subscribe('PB_CONNECT', () => {
      connectSeen += 1;
      if (connectSeen > 1) {
        // Reconexão: o SSE do PB não reenvia backlog — pode ter-nos escapado um
        // convite/entrada em grupo. Lista de grupos completa (barato).
        void catchUp({ reconcileDeletes: true, fullGroups: true });
      }
    });
    groupsUnsub = await pb.collection('groups').subscribe('*', groupsHandler, {
      filter: `members ~ "${userId}"`,
      expand: GROUPS_EXPAND,
    });
    const globalScope = `group_id.members ~ "${userId}"`;
    const globalResults = await Promise.allSettled(
      GLOBAL_COLLS.map((coll) =>
        pb.collection(coll).subscribe('*', makeGlobalHandler(coll), {
          filter: globalScope,
          expand: GLOBAL_EXPAND[coll],
        }),
      ),
    );
    globalUnsubs = globalResults.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const globalFailed = globalResults.filter((r) => r.status === 'rejected').length;
    if (globalFailed) console.warn(`[sync] ${globalFailed} subscrições globais falharam`);
    if (activeGroupId) await swapGroupRealtime(activeGroupId);
  } catch (err) {
    console.warn('[sync] startRealtime falhou — retry em 5s', err);
    setTimeout(() => {
      void stopRealtime().then(() => startRealtime());
    }, 5000);
  } finally {
    realtimeStarting = false;
  }
}

export async function stopRealtime(): Promise<void> {
  for (const u of [...groupRtUnsubs, ...globalUnsubs, groupsUnsub, connectUnsub]) {
    if (u) {
      try {
        await u();
      } catch {
        /* noop */
      }
    }
  }
  groupRtUnsubs = [];
  globalUnsubs = [];
  groupsUnsub = null;
  connectUnsub = null;
  connectSeen = 0;
}

export async function ensureRealtime(): Promise<void> {
  if (groupsUnsub && pb.realtime.isConnected) return;
  await stopRealtime();
  await startRealtime();
}
