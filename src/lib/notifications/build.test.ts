import { describe, expect, it } from 'vitest';
import {
  batchedNotification,
  draftsForEvent,
  nextBatchState,
  type BatchState,
  type Draft,
  type NotificationEvent,
  type NotifyContext,
} from './build';

const NAMES: Record<string, string> = { ana: 'Ana', rui: 'Rui', eva: 'Eva', miguel: 'Miguel' };
const PLACEHOLDERS: Record<string, string | null> = { ph_joao: null, ph_rita: 'eva' };

const ctx: NotifyContext = {
  userName: (id) => NAMES[id] ?? 'Alguém',
  group: (id) => (id === 'g1' ? { name: 'Casa de férias', members: ['ana', 'rui', 'eva', 'miguel'] } : undefined),
  resolveParty: (id) => (id in PLACEHOLDERS ? PLACEHOLDERS[id] : id),
  partyName: (id) => NAMES[id] ?? (id === 'ph_joao' ? 'João' : 'Rita'),
  expense: (id) =>
    id === 'e1'
      ? {
          kind: 'expense',
          description: 'Jantar',
          amount: 30,
          groupId: 'g1',
          payers: [{ party: 'ana', amount: 30 }],
          shares: [
            { party: 'ana', amount: 15 },
            { party: 'rui', amount: 15 },
          ],
        }
      : undefined,
  commenters: (id) => (id === 'e1' ? ['miguel'] : []),
  tripOrderUsers: (id) => (id === 't1' ? ['rui', 'eva'] : []),
  avatarUrl: (id) => `/avatar/${id}`,
};

const ev = (e: Partial<NotificationEvent> & Pick<NotificationEvent, 'type'>): NotificationEvent => ({
  recordId: 'e1',
  actor: 'ana',
  groupId: 'g1',
  data: {},
  ...e,
});

const expense = (extra: Record<string, unknown> = {}) => ({
  kind: 'expense',
  description: 'Jantar',
  amount: 30,
  category: 'food',
  payers: [{ party: 'ana', amount: 30 }],
  shares: [
    { party: 'ana', amount: 10 },
    { party: 'rui', amount: 10 },
    { party: 'ph_joao', amount: 5 },
    { party: 'ph_rita', amount: 5 },
  ],
  ...extra,
});

/** Simula a rota: junta os rascunhos de vários eventos para a mesma pessoa. */
function sendSequence(events: NotificationEvent[], userId: string) {
  const states = new Map<string, BatchState>();
  return events.flatMap((e) =>
    draftsForEvent(e, ctx)
      .filter((d) => d.userId === userId)
      .map((d: Draft) => {
        if (!d.batch) return batchedNotification(d, { count: 1, amountCents: 0, actors: [], subjects: [] }, ctx);
        const state = nextBatchState(states.get(d.batch.key) ?? null, d.batch);
        states.set(d.batch.key, state);
        return batchedNotification(d, state, ctx);
      }),
  );
}

describe('despesas', () => {
  it('avisa quem está envolvido (menos quem criou e pessoas sem conta), com a tua parte', () => {
    const out = draftsForEvent(ev({ type: 'expense.created', data: expense() }), ctx);
    expect(out.map((o) => o.userId).sort()).toEqual(['eva', 'rui']);
    const rui = out.find((o) => o.userId === 'rui')!;
    expect(rui.title).toBe('🍔 Casa de férias');
    expect(rui.body).toMatch(/^Ana adicionou "Jantar" · 30,00\s€\nA tua parte: 10,00\s€$/);
    expect(rui.url).toBe('/groups/g1/expenses/e1');
    // A Eva recebe pela Rita (placeholder que reclamou).
    expect(out.find((o) => o.userId === 'eva')!.body).toMatch(/A tua parte: 5,00/);
  });

  it('despesa entre amigos (sem grupo): título com o nome de quem criou', () => {
    const rui = draftsForEvent(ev({ type: 'expense.created', groupId: '', data: expense() }), ctx).find(
      (o) => o.userId === 'rui',
    )!;
    expect(rui.title).toBe('🍔 Ana');
    expect(rui.url).toBe('/expenses/e1');
  });

  it('rajada: a 2.ª e a 3.ª substituem a anterior (mesma tag) com o total', () => {
    const out = sendSequence(
      [
        ev({ type: 'expense.created', recordId: 'a', data: expense({ amount: 10 }) }),
        ev({ type: 'expense.created', recordId: 'b', data: expense({ amount: 20 }) }),
        ev({ type: 'expense.created', recordId: 'c', data: expense({ amount: 5.5 }) }),
      ],
      'rui',
    );
    expect(out).toHaveLength(3);
    expect(new Set(out.map((o) => o.tag)).size).toBe(1);
    expect(out[0].body).toMatch(/^Ana adicionou "Jantar"/);
    // A cara de quem fez a ação (a mesma pessoa em toda a rajada).
    expect(out.map((o) => o.icon)).toEqual(['/avatar/ana', '/avatar/ana', '/avatar/ana']);
    // Só o primeiro toca; os agrupados substituem-no em silêncio.
    expect(out.map((o) => Boolean(o.quiet))).toEqual([false, true, true]);
    expect(out[2]).toMatchObject({ title: '💰 Casa de férias', url: '/groups/g1/expenses' });
    expect(out[2].body).toMatch(/^Ana adicionou 3 despesas · 35,50/);
  });
});

describe('pagamentos', () => {
  const payment = {
    kind: 'payment',
    description: 'Pagamento',
    amount: 12,
    payers: [{ party: 'rui', amount: 12 }],
    shares: [{ party: 'ana', amount: 12 }],
  };

  it('quem recebe é avisado', () => {
    const out = draftsForEvent(ev({ type: 'expense.created', actor: 'rui', data: payment }), ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userId: 'ana', title: '💸 Casa de férias' });
    expect(out[0].body).toMatch(/^Rui pagou-te 12,00/);
  });

  it('se foi quem recebeu a registar, quem pagou fica a saber', () => {
    const out = draftsForEvent(ev({ type: 'expense.created', actor: 'ana', data: payment }), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe('rui');
    expect(out[0].body).toMatch(/^Ana registou que lhe pagaste 12,00\s€$/);
  });

  it('pagamento alterado: dito do ponto de vista de quem lê', () => {
    const [ana] = draftsForEvent(ev({ type: 'expense.updated', actor: 'rui', data: payment }), ctx);
    expect(ana.body).toMatch(/^Rui alterou o pagamento que te fez · 12,00/);
    const [rui] = draftsForEvent(ev({ type: 'expense.updated', actor: 'ana', data: payment }), ctx);
    expect(rui.body).toMatch(/^Ana alterou o pagamento que lhe fizeste · 12,00/);
    const third = draftsForEvent(ev({ type: 'expense.deleted', actor: 'eva', data: payment }), ctx);
    expect(third.find((d) => d.userId === 'ana')!.body).toMatch(/^Eva apagou o pagamento de Rui para ti/);
  });

  it('dois pagamentos recebidos seguidos juntam-se', () => {
    const out = sendSequence(
      [
        ev({ type: 'expense.created', actor: 'rui', recordId: 'p1', data: payment }),
        ev({ type: 'expense.created', actor: 'rui', recordId: 'p2', data: { ...payment, amount: 8 } }),
      ],
      'ana',
    );
    expect(out[1].body).toMatch(/^Recebeste 2 pagamentos · 20,00/);
  });
});

describe('comentários, viagens, amizades, grupo', () => {
  it('comentário: envolvidos + quem já comentou, menos o autor; vários juntam-se', () => {
    const one = draftsForEvent(
      ev({ type: 'comment.created', actor: 'rui', recordId: 'c1', data: { expenseId: 'e1', content: 'Obrigado!' } }),
      ctx,
    );
    expect(one.map((o) => o.userId).sort()).toEqual(['ana', 'miguel']);
    expect(one[0].body).toBe('Rui em "Jantar": Obrigado!');

    const many = sendSequence(
      [
        ev({ type: 'comment.created', actor: 'rui', recordId: 'c1', data: { expenseId: 'e1', content: 'a' } }),
        ev({ type: 'comment.created', actor: 'rui', recordId: 'c2', data: { expenseId: 'e1', content: 'b' } }),
      ],
      'ana',
    );
    expect(many[1].body).toBe('2 comentários novos em "Jantar"');
  });

  it('viagem aberta: todo o grupo menos quem criou; terminada: só quem pediu', () => {
    const opened = draftsForEvent(ev({ type: 'trip.created', recordId: 't1', data: { name: 'Continente' } }), ctx);
    expect(opened.map((o) => o.userId).sort()).toEqual(['eva', 'miguel', 'rui']);
    expect(opened[0]).toMatchObject({ title: '🛍️ Casa de férias', url: '/groups/g1/trips/t1' });

    const closed = draftsForEvent(
      ev({ type: 'trip.status', recordId: 't1', actor: 'rui', data: { name: 'Continente', status: 'closed' } }),
      ctx,
    );
    expect(closed.map((o) => o.userId)).toEqual(['eva']);
    expect(closed[0].title).toBe('🏁 Casa de férias');
  });

  it('pedido de amizade e aceitação', () => {
    const data = { userA: 'ana', userB: 'rui', requestedBy: 'ana' };
    expect(draftsForEvent(ev({ type: 'friend.requested', groupId: '', recordId: 'f1', data }), ctx)).toEqual([
      expect.objectContaining({ userId: 'rui', body: 'Ana quer ser teu amigo.' }),
    ]);
    expect(draftsForEvent(ev({ type: 'friend.accepted', groupId: '', actor: 'rui', recordId: 'f1', data }), ctx)).toEqual([
      expect.objectContaining({ userId: 'ana', title: '🤝 Rui' }),
    ]);
  });

  it('entradas no grupo juntam-se ("Rui e Eva entraram"); quem entrou não é avisado', () => {
    const joined = (who: string) => ev({ type: 'group.joined', actor: who, recordId: 'g1', data: { userId: who } });
    expect(draftsForEvent(joined('rui'), ctx).some((d) => d.userId === 'rui')).toBe(false);
    const out = sendSequence([joined('rui'), joined('eva')], 'ana');
    expect(out[1].body).toBe('Rui e Eva entraram no grupo');
    // A primeira tem a cara do Rui; a agrupada (duas pessoas) fica sem imagem.
    expect(out[0].icon).toBe('/avatar/rui');
    expect(out[1].icon).toBeUndefined();
  });
});
