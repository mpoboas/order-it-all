import { getCategory } from '@/lib/ledger/categories';
import { toCents, fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';

/**
 * Evento → notificações (puro, testável). A app avisa o servidor logo a seguir
 * a gravar ("criei a despesa X" — `notifyEvent`); a rota
 * `/api/notifications/event` lê o registo, carrega o contexto e chama
 * `draftsForEvent`. É aqui que se decide a quem avisar e o que dizer:
 *
 * - quem fez a ação nunca é avisado (já vê no ecrã);
 * - pessoas sem conta (placeholders por reclamar) não recebem nada; quem
 *   reclamou um placeholder recebe por ele;
 * - o título é o grupo com um emoji ("🍔 Casa de férias") — é o que se lê
 *   primeiro no telemóvel; o corpo diz quem, o quê e quanto é a tua parte.
 *
 * Rajadas: os avisos "agrupáveis" trazem `batch`. Se já houve um igual há
 * pouco (mesma pessoa, mesmo grupo, mesmo tipo), a rota junta-os com
 * `batchedNotification` ("Ana adicionou 3 despesas") e envia com a mesma
 * `tag` — no telemóvel, o aviso novo substitui o anterior em vez de empilhar.
 */

export type NotificationEventType =
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'comment.created'
  | 'trip.created'
  | 'trip.status'
  | 'friend.requested'
  | 'friend.accepted'
  | 'group.joined';

interface PartyAmount {
  party: string;
  amount: number;
}

export interface ExpenseData {
  kind: 'expense' | 'payment';
  description: string;
  amount: number;
  category?: string;
  payers: PartyAmount[];
  shares: PartyAmount[];
}

export interface NotificationEvent {
  type: NotificationEventType;
  /** Id do registo (despesa, comentário, viagem, amizade, grupo). */
  recordId: string;
  /** Quem fez a alteração. */
  actor: string;
  /** '' = sem grupo (despesa direta, amizade). */
  groupId: string;
  /**
   * expense.*: `ExpenseData` · comment: `{ expenseId, content }` · trip:
   * `{ name, status }` · friend: `{ userA, userB, requestedBy }` · group.joined:
   * `{ userId }` (quem entrou).
   */
  data: Record<string, unknown>;
}

export interface NotifyContext {
  userName(userId: string): string;
  group(groupId: string): { name: string; members: string[] } | undefined;
  /** Utilizador por trás de uma parte; `null` = pessoa sem conta. */
  resolveParty(partyId: string): string | null;
  partyName(partyId: string): string;
  /** Comentários: a despesa comentada. */
  expense(expenseId: string): (ExpenseData & { groupId: string }) | undefined;
  /** Quem já comentou numa despesa (também recebe os comentários seguintes). */
  commenters(expenseId: string): string[];
  /** Quem tem pedidos (ou participa em pedidos) numa viagem. */
  tripOrderUsers(tripId: string): string[];
  /** Imagem da pessoa para o aviso: a foto, ou as iniciais quando não tem. */
  avatarUrl(userId: string): string;
}

export interface OutgoingNotification {
  userId: string;
  title: string;
  body: string;
  /** Caminho da app ("/groups/…"). */
  url: string;
  /** Avisos com a mesma tag substituem-se no telemóvel em vez de empilhar. */
  tag: string;
  /** Substitui um aviso anterior sem voltar a tocar/vibrar (rajadas). */
  quiet?: boolean;
  /** Imagem grande do aviso (Android): a cara de quem fez a ação. Sem ela, o
   *  aviso não leva imagem — nunca o ícone da app, que já lá está ao lado. */
  icon?: string;
}

/** Tipos de aviso que se juntam quando vêm em rajada. */
export type BatchKind = 'expense.created' | 'expense.updated' | 'expense.deleted' | 'payment.received' | 'comment.created' | 'group.joined';

export interface Draft extends OutgoingNotification {
  batch?: {
    /** Pessoa + grupo (ou despesa) + tipo — igual nos avisos a juntar. */
    key: string;
    kind: BatchKind;
    groupId: string;
    amount: number;
    actor: string;
    /** O que muda de aviso para aviso (despesa comentada, quem entrou). */
    subject?: string;
  };
}

/** O que fica guardado em `notification_log` sobre uma rajada em curso. */
export interface BatchState {
  count: number;
  /** Cêntimos. */
  amountCents: number;
  actors: string[];
  subjects: string[];
}

const eur = (euros: number) => formatEUR(euros);

function unique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].filter(Boolean);
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

function titleFor(emoji: string, groupId: string, fallback: string, ctx: NotifyContext): string {
  const name = groupId ? ctx.group(groupId)?.name : undefined;
  return `${emoji} ${name || fallback}`;
}

function expenseUrl(groupId: string, expenseId: string): string {
  return groupId ? `/groups/${groupId}/expenses/${expenseId}` : `/expenses/${expenseId}`;
}

/** Utilizadores reais envolvidos (pagadores + partes), sem quem fez a ação. */
function involvedUsers(data: ExpenseData, actor: string, ctx: NotifyContext): string[] {
  return unique([...data.payers, ...data.shares].map((p) => ctx.resolveParty(p.party) ?? '')).filter(
    (id) => id !== actor,
  );
}

function shareOf(userId: string, list: PartyAmount[], ctx: NotifyContext): number {
  return fromCents(
    list.filter((p) => ctx.resolveParty(p.party) === userId).reduce((sum, p) => sum + toCents(p.amount), 0),
  );
}

/**
 * Os avisos que um evento gera, um por destinatário. Todos levam a cara de
 * quem fez a ação (no Android, a imagem grande à direita) — o tipo já vai no
 * emoji do título.
 */
export function draftsForEvent(e: NotificationEvent, ctx: NotifyContext): Draft[] {
  const person = e.type === 'group.joined' ? String(e.data.userId ?? e.actor) : e.actor;
  const icon = person ? ctx.avatarUrl(person) : undefined;
  return rawDrafts(e, ctx).map((d) => ({ ...d, icon }));
}

function rawDrafts(e: NotificationEvent, ctx: NotifyContext): Draft[] {
  const actorName = ctx.userName(e.actor);
  const g = e.groupId;

  switch (e.type) {
    case 'expense.created':
    case 'expense.updated':
    case 'expense.deleted': {
      const data = e.data as unknown as ExpenseData;
      const url = e.type === 'expense.deleted' ? (g ? `/groups/${g}/expenses` : '/people') : expenseUrl(g, e.recordId);
      return involvedUsers(data, e.actor, ctx).map((userId) =>
        data.kind === 'payment'
          ? paymentDraft(e, data, userId, actorName, url, ctx)
          : expenseDraft(e, data, userId, actorName, url, ctx),
      );
    }

    case 'comment.created': {
      const expenseId = String(e.data.expenseId ?? '');
      const expense = ctx.expense(expenseId);
      if (!expense) return [];
      const text = String(e.data.content ?? '').trim();
      const recipients = unique([...involvedUsers(expense, e.actor, ctx), ...ctx.commenters(expenseId)]).filter(
        (id) => id !== e.actor,
      );
      return recipients.map((userId) => ({
        userId,
        title: titleFor('💬', expense.groupId, actorName, ctx),
        body: `${actorName} em "${expense.description}": ${text.length > 90 ? `${text.slice(0, 90)}…` : text}`,
        url: expenseUrl(expense.groupId, expenseId),
        tag: `comments:${expenseId}`,
        batch: {
          key: `${userId}|comments|${expenseId}`,
          kind: 'comment.created',
          groupId: expense.groupId,
          amount: 0,
          actor: e.actor,
          subject: expense.description,
        },
      }));
    }

    case 'trip.created':
    case 'trip.status': {
      const name = String(e.data.name ?? 'A viagem');
      const status = String(e.data.status ?? 'open');
      if (e.type === 'trip.status' && status === 'open') return [];
      // Terminar a viagem só interessa a quem pediu alguma coisa nela.
      const recipients =
        e.type === 'trip.status' && status === 'closed' ? ctx.tripOrderUsers(e.recordId) : (ctx.group(g)?.members ?? []);
      const [emoji, body] =
        e.type === 'trip.created'
          ? ['🛍️', `${name} está aberta. Faz os teus pedidos!`]
          : status === 'in_progress'
            ? ['🛒', `${name} já não aceita pedidos. Vamos às compras!`]
            : ['🏁', `As compras de ${name} terminaram.`];
      return unique(recipients)
        .filter((id) => id !== e.actor)
        .map((userId) => ({
          userId,
          title: titleFor(emoji, g, 'Viagem', ctx),
          body,
          url: `/groups/${g}/trips/${e.recordId}`,
          tag: `trip:${e.recordId}`,
        }));
    }

    case 'friend.requested':
    case 'friend.accepted': {
      const a = String(e.data.userA ?? '');
      const b = String(e.data.userB ?? '');
      const requestedBy = String(e.data.requestedBy ?? '');
      const other = requestedBy === a ? b : a;
      const userId = e.type === 'friend.requested' ? other : requestedBy;
      if (!userId || userId === e.actor) return [];
      return [
        {
          userId,
          title: e.type === 'friend.requested' ? '🤝 Pedido de amizade' : `🤝 ${actorName}`,
          body: e.type === 'friend.requested' ? `${actorName} quer ser teu amigo.` : 'Aceitou o teu pedido de amizade.',
          url: '/people',
          tag: `friend:${e.recordId}`,
        },
      ];
    }

    case 'group.joined': {
      const newcomer = String(e.data.userId ?? e.actor);
      const name = ctx.userName(newcomer);
      return (ctx.group(g)?.members ?? [])
        .filter((id) => id !== newcomer)
        .map((userId) => ({
          userId,
          title: titleFor('👋', g, 'Grupo', ctx),
          body: `${name} entrou no grupo`,
          url: `/groups/${g}/settings`,
          tag: `joined:${g}`,
          batch: { key: `${userId}|joined|${g}`, kind: 'group.joined', groupId: g, amount: 0, actor: newcomer, subject: name },
        }));
    }
  }
  return [];
}

function expenseDraft(
  e: NotificationEvent,
  data: ExpenseData,
  userId: string,
  actorName: string,
  url: string,
  ctx: NotifyContext,
): Draft {
  const g = e.groupId;
  const kind = e.type as 'expense.created' | 'expense.updated' | 'expense.deleted';
  const share = shareOf(userId, data.shares, ctx);
  // Linha própria: no telemóvel, aberto, lê-se "quanto foi" e "quanto é teu" separados.
  const yourPart = share > 0 && kind !== 'expense.deleted' ? `\nA tua parte: ${eur(share)}` : '';
  const emoji = kind === 'expense.created' ? getCategory(data.category).emoji : kind === 'expense.updated' ? '✏️' : '🗑️';
  const verb = kind === 'expense.created' ? 'adicionou' : kind === 'expense.updated' ? 'alterou' : 'apagou';
  const key = `${userId}|${g || 'direct'}|${kind}`;
  return {
    userId,
    title: titleFor(emoji, g, actorName, ctx),
    body: `${actorName} ${verb} "${data.description}" · ${eur(data.amount)}${yourPart}`,
    url,
    tag: key,
    batch: { key, kind, groupId: g, amount: data.amount, actor: e.actor },
  };
}

function paymentDraft(
  e: NotificationEvent,
  data: ExpenseData,
  userId: string,
  actorName: string,
  url: string,
  ctx: NotifyContext,
): Draft {
  const g = e.groupId;
  const payer = data.payers[0]?.party ?? '';
  const payee = data.shares[0]?.party ?? '';
  const payerName = ctx.partyName(payer);
  const payeeName = ctx.partyName(payee);
  const amount = eur(data.amount);

  if (e.type === 'expense.created') {
    if (ctx.resolveParty(payee) === userId) {
      const key = `${userId}|${g || 'direct'}|payment.received`;
      return {
        userId,
        title: titleFor('💸', g, payerName, ctx),
        body: `${payerName} pagou-te ${amount}`,
        url,
        tag: key,
        batch: { key, kind: 'payment.received', groupId: g, amount: data.amount, actor: e.actor },
      };
    }
    // Alguém registou um pagamento teu (ex.: quem recebeu marcou que pagaste).
    return {
      userId,
      title: titleFor('💸', g, actorName, ctx),
      body:
        ctx.resolveParty(payee) === e.actor
          ? `${actorName} registou que lhe pagaste ${amount}`
          : `${actorName} registou que pagaste ${amount} a ${payeeName}`,
      url,
      tag: `payment:${e.recordId}`,
    };
  }
  // Dito do ponto de vista de quem lê: "o pagamento que te fez", "o teu pagamento".
  const verb = e.type === 'expense.updated' ? 'alterou' : 'apagou';
  const iAmPayee = ctx.resolveParty(payee) === userId;
  const iAmPayer = ctx.resolveParty(payer) === userId;
  const actorIsPayer = ctx.resolveParty(payer) === e.actor;
  const actorIsPayee = ctx.resolveParty(payee) === e.actor;
  const what =
    iAmPayee && actorIsPayer
      ? 'o pagamento que te fez'
      : iAmPayer && actorIsPayee
        ? 'o pagamento que lhe fizeste'
        : iAmPayee
          ? `o pagamento de ${payerName} para ti`
          : iAmPayer
            ? `o teu pagamento a ${payeeName}`
            : `o pagamento de ${payerName} a ${payeeName}`;
  return {
    userId,
    title: titleFor(e.type === 'expense.updated' ? '✏️' : '🗑️', g, actorName, ctx),
    body: `${actorName} ${verb} ${what} · ${amount}`,
    url,
    tag: `payment:${e.recordId}`,
  };
}

/** Estado da rajada depois de juntar este aviso ao que já havia. */
export function nextBatchState(previous: BatchState | null, batch: NonNullable<Draft['batch']>): BatchState {
  return {
    count: (previous?.count ?? 0) + 1,
    amountCents: (previous?.amountCents ?? 0) + toCents(batch.amount),
    actors: unique([...(previous?.actors ?? []), batch.actor]),
    subjects: unique([...(previous?.subjects ?? []), batch.subject ?? '']),
  };
}

/**
 * O aviso a enviar para uma rajada com `state.count` avisos. Com 1, é o
 * próprio rascunho; com mais, a versão agrupada — sempre com a mesma `tag`,
 * para substituir o anterior no telemóvel.
 */
export function batchedNotification(draft: Draft, state: BatchState, ctx: NotifyContext): OutgoingNotification {
  const { batch } = draft;
  const base: OutgoingNotification = {
    userId: draft.userId,
    title: draft.title,
    body: draft.body,
    url: draft.url,
    tag: draft.tag,
    icon: draft.icon,
  };
  if (!batch || state.count <= 1) return base;

  const n = state.count;
  base.quiet = true;
  // Várias pessoas na rajada: não há uma cara que a represente.
  if (state.actors.length > 1) base.icon = undefined;
  const who = state.actors.length === 1 ? ctx.userName(state.actors[0]) : null;
  const total = eur(fromCents(state.amountCents));
  const g = batch.groupId;
  const listUrl = g ? `/groups/${g}/expenses` : '/people';

  switch (batch.kind) {
    case 'expense.created':
      return {
        ...base,
        title: titleFor('💰', g, who ?? 'Despesas', ctx),
        body: who ? `${who} adicionou ${n} despesas · ${total}` : `${n} despesas novas · ${total}`,
        url: listUrl,
      };
    case 'expense.updated':
      return { ...base, body: who ? `${who} alterou ${n} despesas` : `${n} despesas alteradas`, url: listUrl };
    case 'expense.deleted':
      return { ...base, body: who ? `${who} apagou ${n} despesas` : `${n} despesas apagadas`, url: listUrl };
    case 'payment.received':
      return { ...base, body: `Recebeste ${n} pagamentos · ${total}`, url: listUrl };
    case 'comment.created':
      return { ...base, body: `${n} comentários novos em "${state.subjects[0] ?? ''}"` };
    case 'group.joined': {
      const names = state.subjects;
      return { ...base, body: `${listNames(names)} ${names.length > 1 ? 'entraram' : 'entrou'} no grupo` };
    }
  }
}
