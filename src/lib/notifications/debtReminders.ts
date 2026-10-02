import type PocketBase from 'pocketbase';
import type { Expense } from '@/lib/types';
import { staleDebtReminders, type LedgerScope } from './debts';
import { sendNotifications } from './send';

/**
 * Lembrete mensal de dívidas — a Scheduled Function do Netlify
 * (`netlify/functions/debt-reminders.mts`) chama a rota
 * `/api/notifications/debt-reminders` no dia 1 de cada mês. A lógica de quem
 * avisar está em `staleDebtReminders` (só quem deve há mais de 15 dias, um
 * aviso por grupo). Aproveita para limpar o histórico de notificações antigo.
 */

const LOG_KEEP_DAYS = 30;

export async function sendMonthlyDebtReminders(
  pb: PocketBase,
  now = new Date(),
): Promise<{ month: string; notifications: number; skipped?: boolean }> {
  const month = now.toISOString().slice(0, 7);

  // Uma vez por mês, no máximo: a marca é criada ANTES de enviar e a chave é
  // única — uma segunda chamada no mesmo mês falha aqui e não envia nada.
  try {
    await pb.collection('notification_log').create({ key: `debt-reminders|${month}` });
  } catch {
    return { month, notifications: 0, skipped: true };
  }

  const [groups, expenses, placeholders, users] = await Promise.all([
    pb.collection('groups').getFullList<{ id: string; name: string; simplify_debts?: boolean }>({
      fields: 'id,name,simplify_debts',
    }),
    pb.collection('expenses').getFullList<Expense>({
      filter: 'deleted_at = ""',
      fields: 'id,group_id,kind,amount,payers,shares,participants,created,deleted_at',
    }),
    pb.collection('placeholders').getFullList<{ id: string; name: string; claimed_by: string }>({
      fields: 'id,name,claimed_by',
    }),
    pb.collection('users').getFullList<{ id: string; name: string }>({ fields: 'id,name' }),
  ]);

  const userName = new Map(users.map((u) => [u.id, u.name?.trim() || 'Alguém']));
  const placeholder = new Map(placeholders.map((p) => [p.id, p]));
  const resolve = (id: string) => placeholder.get(id)?.claimed_by || id;
  const userOf = (id: string) => {
    const ph = placeholder.get(id);
    if (ph) return ph.claimed_by || null;
    return userName.has(id) ? id : null;
  };
  const partyName = (id: string) => {
    const ph = placeholder.get(id);
    if (ph) return ph.claimed_by ? (userName.get(ph.claimed_by) ?? ph.name) : ph.name;
    return userName.get(id) ?? 'Alguém';
  };

  const byGroup = new Map<string, Expense[]>();
  const direct = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.group_id) byGroup.set(e.group_id, [...(byGroup.get(e.group_id) ?? []), e]);
    else {
      // Diretas: um "livro" por par de amigos.
      const pair = [...(e.participants ?? [])].sort().join('|');
      if (pair) direct.set(pair, [...(direct.get(pair) ?? []), e]);
    }
  }

  const common = { resolve, userOf, partyName };
  const scopes: LedgerScope[] = [
    ...groups
      .filter((g) => byGroup.has(g.id))
      .map((g) => ({ ...common, groupId: g.id, name: g.name, simplify: g.simplify_debts ?? true, expenses: byGroup.get(g.id)! })),
    ...[...direct.values()].map((list) => ({ ...common, groupId: '', name: '', simplify: false, expenses: list })),
  ];

  const notifications = staleDebtReminders(scopes, now);
  await sendNotifications(pb, notifications);
  await cleanupLog(pb, now);
  return { month, notifications: notifications.length };
}

/** O histórico só serve para as rajadas (minutos) e para não repetir avisos. */
async function cleanupLog(pb: PocketBase, now: Date) {
  try {
    const old = await pb.collection('notification_log').getFullList<{ id: string; key: string }>({
      filter: pb.filter('updated < {:cutoff} && key !~ "debt-reminders|"', {
        cutoff: new Date(now.getTime() - LOG_KEEP_DAYS * 86_400_000),
      }),
      fields: 'id,key',
    });
    for (const row of old) await pb.collection('notification_log').delete(row.id);
  } catch (error) {
    console.error('notification_log cleanup failed:', error);
  }
}
