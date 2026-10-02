import type PocketBase from 'pocketbase';
import {
  batchedNotification,
  draftsForEvent,
  nextBatchState,
  type BatchState,
  type ExpenseData,
  type NotificationEvent,
  type NotificationEventType,
  type NotifyContext,
  type OutgoingNotification,
} from './build';
import { sendNotifications, type SendResult } from './send';
import { notificationAvatarUrl } from './avatar';

/**
 * Do "a app acabou de gravar X" até aos avisos enviados (só servidor). Usado
 * pela rota `/api/notifications/event` e, para a entrada num grupo por
 * convite, pela própria rota do convite.
 *
 * 1. `eventFromRecord` — lê o registo com o superuser e confirma que quem
 *    chama fez mesmo aquela alteração, há pouco. Assim ninguém consegue
 *    mandar avisos sobre coisas que não fez (nem repetir avisos antigos).
 * 2. `dispatchEvent` — marca o evento como tratado (uma vez só, mesmo que a
 *    app chame duas vezes), constrói os avisos (`build.ts`), junta rajadas com
 *    o histórico em `notification_log` e envia.
 */

/** Uma alteração só pode ser anunciada até este tempo depois de feita. */
const RECENT_MS = 10 * 60_000;
/** Avisos do mesmo tipo dentro desta janela juntam-se num só. */
const BATCH_WINDOW_MS = 5 * 60_000;

/** Tipos que a app pode anunciar (a entrada num grupo é só do servidor). */
export const CLIENT_EVENT_TYPES: NotificationEventType[] = [
  'expense.created',
  'expense.updated',
  'expense.deleted',
  'comment.created',
  'trip.created',
  'trip.status',
  'friend.requested',
  'friend.accepted',
];

type Row = Record<string, unknown> & { id: string; created: string; updated: string };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isRecent = (date: unknown) => {
  const t = new Date(str(date).replace(' ', 'T')).getTime();
  return Number.isFinite(t) && Date.now() - t < RECENT_MS;
};

async function getRecord(pb: PocketBase, collection: string, id: string): Promise<Row | null> {
  try {
    return await pb.collection(collection).getOne<Row>(id);
  } catch {
    return null;
  }
}

function expenseData(r: Row): ExpenseData {
  return {
    kind: r.kind === 'payment' ? 'payment' : 'expense',
    description: str(r.description),
    amount: Number(r.amount ?? 0),
    category: str(r.category),
    payers: Array.isArray(r.payers) ? (r.payers as ExpenseData['payers']) : [],
    shares: Array.isArray(r.shares) ? (r.shares as ExpenseData['shares']) : [],
  };
}

/**
 * O evento, se `callerId` fez mesmo esta alteração há menos de 10 minutos;
 * senão `null`. `stamp` distingue duas alterações ao mesmo registo (para a
 * marca de "já tratado").
 */
export async function eventFromRecord(
  pb: PocketBase,
  type: NotificationEventType,
  recordId: string,
  callerId: string,
): Promise<(NotificationEvent & { stamp: string }) | null> {
  const base = { type, recordId, actor: callerId };

  switch (type) {
    case 'expense.created':
    case 'expense.updated':
    case 'expense.deleted': {
      const r = await getRecord(pb, 'expenses', recordId);
      if (!r) return null;
      const ok =
        type === 'expense.created'
          ? r.created_by === callerId && isRecent(r.created)
          : type === 'expense.updated'
            ? r.updated_by === callerId && isRecent(r.updated) && !r.deleted_at
            : r.deleted_by === callerId && isRecent(r.deleted_at);
      if (!ok) return null;
      return { ...base, groupId: str(r.group_id), data: { ...expenseData(r) }, stamp: r.updated };
    }

    case 'comment.created': {
      const r = await getRecord(pb, 'expense_comments', recordId);
      if (!r || r.user !== callerId || !isRecent(r.created)) return null;
      return {
        ...base,
        groupId: str(r.group_id),
        data: { expenseId: str(r.expense_id), content: str(r.content).slice(0, 300) },
        stamp: r.created,
      };
    }

    case 'trip.created':
    case 'trip.status': {
      const r = await getRecord(pb, 'trips', recordId);
      if (!r) return null;
      if (type === 'trip.created' && !(r.created_by === callerId && isRecent(r.created))) return null;
      if (type === 'trip.status') {
        const group = await getRecord(pb, 'groups', str(r.group_id));
        const admins = Array.isArray(group?.admins) ? (group.admins as string[]) : [];
        if (!admins.includes(callerId) || !isRecent(r.updated)) return null;
      }
      return {
        ...base,
        groupId: str(r.group_id),
        data: { name: str(r.name), status: str(r.status) },
        stamp: `${str(r.status)}|${r.updated}`,
      };
    }

    case 'friend.requested':
    case 'friend.accepted': {
      const r = await getRecord(pb, 'friendships', recordId);
      if (!r || !isRecent(r.updated)) return null;
      const involved = r.user_a === callerId || r.user_b === callerId;
      const ok =
        type === 'friend.requested'
          ? r.requested_by === callerId && r.status === 'pending'
          : involved && r.requested_by !== callerId && r.status === 'accepted';
      if (!ok) return null;
      return {
        ...base,
        groupId: '',
        data: { userA: str(r.user_a), userB: str(r.user_b), requestedBy: str(r.requested_by) },
        stamp: str(r.status),
      };
    }
  }
  return null;
}

async function listByIds<T>(pb: PocketBase, collection: string, ids: string[], fields: string): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const filter = unique.map((id, i) => pb.filter(`id = {:v${i}}`, { [`v${i}`]: id })).join(' || ');
  return pb.collection(collection).getFullList<T>({ filter, fields });
}

async function loadContext(pb: PocketBase, e: NotificationEvent): Promise<NotifyContext> {
  const commentExpenseId = e.type === 'comment.created' ? str(e.data.expenseId) : '';
  const closedTrip = e.type === 'trip.status' && e.data.status === 'closed' ? e.recordId : '';

  const [group, placeholders, commented, comments, orders] = await Promise.all([
    e.groupId ? getRecord(pb, 'groups', e.groupId) : null,
    e.groupId
      ? pb.collection('placeholders').getFullList<{ id: string; name: string; claimed_by: string }>({
          filter: pb.filter('group_id = {:g}', { g: e.groupId }),
          fields: 'id,name,claimed_by',
        })
      : [],
    commentExpenseId ? getRecord(pb, 'expenses', commentExpenseId) : null,
    commentExpenseId
      ? pb.collection('expense_comments').getFullList<{ user: string }>({
          filter: pb.filter('expense_id = {:x}', { x: commentExpenseId }),
          fields: 'user',
        })
      : [],
    closedTrip
      ? pb.collection('orders').getFullList<{ user: string; participants: string[] }>({
          filter: pb.filter('trip_id = {:t}', { t: closedTrip }),
          fields: 'user,participants',
        })
      : [],
  ]);

  const members = Array.isArray(group?.members) ? (group.members as string[]) : [];
  const expense = commented ? expenseData(commented) : null;
  const data = e.data as Partial<ExpenseData> & Record<string, unknown>;
  const users = await listByIds<{ id: string; name: string; avatar?: string }>(
    pb,
    'users',
    [
      e.actor,
      ...members,
      ...[...(data.payers ?? []), ...(data.shares ?? [])].map((p) => p.party),
      ...[...(expense?.payers ?? []), ...(expense?.shares ?? [])].map((p) => p.party),
      str(data.userA),
      str(data.userB),
      str(data.userId),
      ...placeholders.map((p) => p.claimed_by),
    ],
    'id,name,avatar',
  );

  const userById = new Map(users.map((u) => [u.id, u]));
  const userNames = new Map(users.map((u) => [u.id, u.name?.trim() || 'Alguém']));
  const placeholderById = new Map(placeholders.map((p) => [p.id, p]));

  return {
    userName: (id) => userNames.get(id) ?? 'Alguém',
    group: (id) => (group && id === group.id ? { name: str(group.name), members } : undefined),
    resolveParty: (id) => {
      const ph = placeholderById.get(id);
      if (ph) return ph.claimed_by || null;
      return userNames.has(id) ? id : null;
    },
    partyName: (id) => {
      const ph = placeholderById.get(id);
      if (ph) return ph.claimed_by ? (userNames.get(ph.claimed_by) ?? ph.name) : ph.name;
      return userNames.get(id) ?? 'Alguém';
    },
    expense: (id) => (expense && id === commentExpenseId ? { ...expense, groupId: str(commented?.group_id) } : undefined),
    commenters: () => comments.map((c) => c.user),
    tripOrderUsers: () => orders.flatMap((o) => [o.user, ...(o.participants ?? [])]),
    avatarUrl: (id) => notificationAvatarUrl(userById.get(id)),
  };
}

interface LogRow {
  id: string;
  key: string;
  count: number;
  amount_cents: number;
  actors: string[];
  subjects: string[];
  updated: string;
}

/** Marca um evento como tratado; `false` se já estava (outra chamada chegou primeiro). */
async function claimEvent(pb: PocketBase, key: string): Promise<boolean> {
  try {
    await pb.collection('notification_log').create({ key });
    return true;
  } catch {
    return false; // `key` é única — já tratado
  }
}

/**
 * Junta o aviso à rajada em curso (se houver uma recente) e grava o estado.
 * Dois avisos da mesma rajada ao mesmo tempo (duas despesas lançadas no mesmo
 * segundo) leem ambos "sem rajada" e tentam criar a mesma `key` única: quem
 * perde volta a ler e junta-se à do outro.
 */
async function withBatch(
  pb: PocketBase,
  key: string,
  apply: (prev: BatchState | null) => BatchState,
  attempt = 0,
): Promise<BatchState> {
  let row: LogRow | null = null;
  try {
    row = await pb.collection('notification_log').getFirstListItem<LogRow>(pb.filter('key = {:key}', { key }));
  } catch {
    row = null;
  }
  const fresh = row && Date.now() - new Date(row.updated.replace(' ', 'T')).getTime() < BATCH_WINDOW_MS;
  const prev: BatchState | null = fresh
    ? { count: row!.count, amountCents: row!.amount_cents, actors: row!.actors ?? [], subjects: row!.subjects ?? [] }
    : null;
  const state = apply(prev);
  const fields = { count: state.count, amount_cents: state.amountCents, actors: state.actors, subjects: state.subjects };
  try {
    if (row && prev) {
      // Rajada em curso: a contagem e o valor sobem no servidor (`+`), de forma
      // atómica — dois avisos no mesmo instante contam os dois. O texto usa os
      // valores que o servidor devolve, não os lidos antes.
      const saved = await pb.collection('notification_log').update<LogRow>(row.id, {
        'count+': state.count - prev.count,
        'amount_cents+': state.amountCents - prev.amountCents,
        actors: state.actors,
        subjects: state.subjects,
      });
      return { ...state, count: saved.count, amountCents: saved.amount_cents };
    }
    if (row) await pb.collection('notification_log').update(row.id, fields);
    else await pb.collection('notification_log').create({ key, ...fields });
  } catch (error) {
    if (attempt < 2) return withBatch(pb, key, apply, attempt + 1);
    throw error;
  }
  return state;
}

export async function dispatchEvent(
  pb: PocketBase,
  event: NotificationEvent & { stamp: string },
  fallbackOrigin?: string | null,
): Promise<SendResult & { skipped?: boolean }> {
  if (!(await claimEvent(pb, `event|${event.type}|${event.recordId}|${event.stamp}`))) {
    return { sent: 0, failed: 0, removed: 0, skipped: true };
  }

  const ctx = await loadContext(pb, event);
  const notifications: OutgoingNotification[] = [];
  for (const draft of draftsForEvent(event, ctx)) {
    const batch = draft.batch;
    // Se a rajada não se deixar gravar, o aviso segue sozinho — nunca se perde.
    const state = batch
      ? await withBatch(pb, batch.key, (prev) => nextBatchState(prev, batch)).catch((error) => {
          console.error('Notification batch failed:', error);
          return nextBatchState(null, batch);
        })
      : { count: 1, amountCents: 0, actors: [], subjects: [] };
    notifications.push(batchedNotification(draft, state, ctx));
  }
  return sendNotifications(pb, notifications, fallbackOrigin);
}

/** Alguém entrou num grupo por convite (chamado pela rota do convite). */
export async function notifyGroupJoined(pb: PocketBase, groupId: string, userId: string): Promise<void> {
  try {
    await dispatchEvent(pb, {
      type: 'group.joined',
      recordId: groupId,
      actor: userId,
      groupId,
      data: { userId },
      stamp: userId,
    });
  } catch (error) {
    console.error('notifyGroupJoined failed:', error);
  }
}
