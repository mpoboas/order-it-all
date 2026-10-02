'use client';

// Bancada das notificações — só em desenvolvimento, como /dev/ui. Não está
// ligada a nada; abre /dev/notifications à mão.
//
// - Este dispositivo: o que o browser suporta, a permissão e se está ligado à
//   conta (com botões para ativar / voltar a ligar).
// - Catálogo: todas as notificações da app, geradas pelo MESMO código que as
//   envia (`draftsForEvent`, `batchedNotification`, `staleDebtReminders`) com
//   dados de exemplo — o texto aqui é exatamente o real. "Enviar para mim"
//   manda-a a sério para os teus dispositivos (`/api/dev/notifications`).
// - O ecrã que pede para ativar as notificações, em cada fase.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { NotificationInstallPrompt } from '@/components/features/NotificationInstallPrompt';
import { useToast } from '@/context/ToastContext';
import { useUser } from '@/context/UserContext';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { authHeaders } from '@/lib/pocketbase';
import { subscribeToPushNotifications } from '@/lib/notifications';
import type { NotificationPromptStage } from '@/lib/notificationPromptState';
import {
  batchedNotification,
  draftsForEvent,
  nextBatchState,
  type BatchState,
  type NotificationEvent,
  type NotifyContext,
  type OutgoingNotification,
} from '@/lib/notifications/build';
import { staleDebtReminders, type LedgerScope } from '@/lib/notifications/debts';
import { notificationAvatarUrl } from '@/lib/notifications/avatar';
import type { Expense } from '@/lib/types';

// --- Dados de exemplo -------------------------------------------------------

const ME = 'rui';
const NAMES: Record<string, string> = { ana: 'Ana', rui: 'Rui', eva: 'Eva', miguel: 'Miguel' };
const GROUP = 'casadeferias000';

const ctx: NotifyContext = {
  userName: (id) => NAMES[id] ?? 'Alguém',
  group: (id) => (id === GROUP ? { name: 'Casa de férias', members: Object.keys(NAMES) } : undefined),
  resolveParty: (id) => (id === 'ph_joao' ? null : id),
  partyName: (id) => NAMES[id] ?? 'João',
  expense: () => ({
    kind: 'expense',
    description: 'Jantar de sexta',
    amount: 37.5,
    groupId: GROUP,
    payers: [{ party: 'ana', amount: 37.5 }],
    shares: [
      { party: 'ana', amount: 12.5 },
      { party: 'rui', amount: 12.5 },
      { party: 'eva', amount: 12.5 },
    ],
  }),
  commenters: () => [],
  tripOrderUsers: () => ['rui', 'eva'],
  // Sem fotos nos dados de exemplo: as iniciais, como para quem não tem foto.
  avatarUrl: (id) => notificationAvatarUrl({ id, name: NAMES[id] }),
};

/** Despesa paga pela Ana, a dividir pelos três. */
const expense = ({ amount = 37.5, ...extra }: Record<string, unknown> & { amount?: number } = {}) => ({
  kind: 'expense',
  description: 'Jantar de sexta',
  amount,
  category: 'food',
  payers: [{ party: 'ana', amount }],
  shares: ['ana', 'rui', 'eva'].map((party) => ({ party, amount: Math.round((amount / 3) * 100) / 100 })),
  ...extra,
});

const payment = (amount: number) => ({
  kind: 'payment',
  description: 'Pagamento',
  amount,
  payers: [{ party: 'ana', amount }],
  shares: [{ party: 'rui', amount }],
});

const ev = (e: Partial<NotificationEvent> & Pick<NotificationEvent, 'type'>): NotificationEvent => ({
  recordId: 'exemplo00000001',
  actor: 'ana',
  groupId: GROUP,
  data: {},
  ...e,
});

/** O que o Rui recebe por uma sequência de eventos (rajadas incluídas). */
function received(events: NotificationEvent[], who = ME): OutgoingNotification[] {
  const states = new Map<string, BatchState>();
  return events.flatMap((e) =>
    draftsForEvent(e, ctx)
      .filter((d) => d.userId === who)
      .map((d) => {
        if (!d.batch) return batchedNotification(d, { count: 1, amountCents: 0, actors: [], subjects: [] }, ctx);
        const state = nextBatchState(states.get(d.batch.key) ?? null, d.batch);
        states.set(d.batch.key, state);
        return batchedNotification(d, state, ctx);
      }),
  );
}

const DAY = 86_400_000;
function debtReminders(): OutgoingNotification[] {
  const old = new Date(Date.now() - 30 * DAY).toISOString();
  const exp = (payer: string, debtor: string, amount: number, extra: Partial<Expense> = {}) =>
    ({
      id: `${payer}${debtor}${amount}`,
      kind: 'expense',
      amount,
      created: old,
      payers: [{ party: payer, amount }],
      shares: [{ party: debtor, amount }],
      ...extra,
    }) as unknown as Expense;
  const base = { resolve: (id: string) => id, userOf: (id: string) => id, partyName: (id: string) => NAMES[id] ?? id };
  const scopes: LedgerScope[] = [
    { ...base, groupId: GROUP, name: 'Casa de férias', simplify: false, expenses: [exp('ana', 'rui', 23.4), exp('eva', 'rui', 6)] },
    { ...base, groupId: '', name: '', simplify: false, expenses: [exp('miguel', 'rui', 15)] },
  ];
  return staleDebtReminders(scopes, new Date()).filter((n) => n.userId === ME);
}

interface Scenario {
  title: string;
  note?: string;
  /** Vários = uma sequência (rajada): cada um substitui o anterior. */
  notifications: OutgoingNotification[];
}

const SCENARIOS: { section: string; items: Scenario[] }[] = [
  {
    section: 'Despesas',
    items: [
      { title: 'Nova despesa', notifications: received([ev({ type: 'expense.created', data: expense() })]) },
      {
        title: 'Nova despesa (outra categoria)',
        notifications: received([
          ev({ type: 'expense.created', data: expense({ description: 'Gasolina', amount: 60, category: 'transport' }) }),
        ]),
      },
      {
        title: 'Despesa entre amigos (sem grupo)',
        notifications: received([ev({ type: 'expense.created', groupId: '', data: expense() })]),
      },
      { title: 'Despesa alterada', notifications: received([ev({ type: 'expense.updated', data: expense({ amount: 42 }) })]) },
      { title: 'Despesa apagada', notifications: received([ev({ type: 'expense.deleted', data: expense() })]) },
      {
        title: 'Rajada: 3 despesas seguidas',
        note: 'A 2.ª e a 3.ª substituem a anterior, sem tocar.',
        notifications: received([
          ev({ type: 'expense.created', recordId: 'a', data: expense({ description: 'Pão', amount: 3.2, category: 'groceries' }) }),
          ev({ type: 'expense.created', recordId: 'b', data: expense({ description: 'Gasolina', amount: 60, category: 'transport' }) }),
          ev({ type: 'expense.created', recordId: 'c', data: expense() }),
        ]),
      },
    ],
  },
  {
    section: 'Pagamentos',
    items: [
      { title: 'Pagamento recebido', notifications: received([ev({ type: 'expense.created', data: payment(12) })]) },
      {
        title: 'Alguém registou que pagaste',
        note: 'Visto do lado da Ana: o Rui registou o pagamento.',
        notifications: received([ev({ type: 'expense.created', actor: 'rui', data: payment(12) })], 'ana'),
      },
      { title: 'Pagamento alterado', notifications: received([ev({ type: 'expense.updated', data: payment(15) })]) },
      {
        title: 'Rajada: 2 pagamentos recebidos',
        notifications: received([
          ev({ type: 'expense.created', recordId: 'p1', data: payment(12) }),
          ev({ type: 'expense.created', recordId: 'p2', data: payment(8) }),
        ]),
      },
    ],
  },
  {
    section: 'Comentários',
    items: [
      {
        title: 'Comentário',
        notifications: received([ev({ type: 'comment.created', data: { expenseId: 'e1', content: 'Paguei com o cartão do grupo' } })]),
      },
      {
        title: 'Rajada: 3 comentários na mesma despesa',
        notifications: received([
          ev({ type: 'comment.created', recordId: 'c1', data: { expenseId: 'e1', content: 'Paguei eu' } }),
          ev({ type: 'comment.created', recordId: 'c2', data: { expenseId: 'e1', content: 'Obrigado!' } }),
          ev({ type: 'comment.created', recordId: 'c3', data: { expenseId: 'e1', content: 'Faltou o vinho' } }),
        ]),
      },
    ],
  },
  {
    section: 'Viagens',
    items: [
      { title: 'Viagem aberta', notifications: received([ev({ type: 'trip.created', data: { name: 'Continente de sábado' } })]) },
      {
        title: 'Fechada aos pedidos',
        notifications: received([ev({ type: 'trip.status', data: { name: 'Continente de sábado', status: 'in_progress' } })]),
      },
      {
        title: 'Compras terminadas',
        note: 'Só a quem pediu alguma coisa.',
        notifications: received([ev({ type: 'trip.status', data: { name: 'Continente de sábado', status: 'closed' } })]),
      },
    ],
  },
  {
    section: 'Amigos e grupo',
    items: [
      {
        title: 'Pedido de amizade',
        notifications: received([ev({ type: 'friend.requested', groupId: '', data: { userA: 'ana', userB: 'rui', requestedBy: 'ana' } })]),
      },
      {
        title: 'Pedido aceite',
        notifications: received([ev({ type: 'friend.accepted', groupId: '', data: { userA: 'ana', userB: 'rui', requestedBy: 'rui' } })]),
      },
      {
        title: 'Rajada: entraram no grupo',
        notifications: received([
          ev({ type: 'group.joined', actor: 'eva', data: { userId: 'eva' } }),
          ev({ type: 'group.joined', actor: 'miguel', data: { userId: 'miguel' } }),
        ]),
      },
    ],
  },
  {
    section: 'Lembretes',
    items: [
      { title: 'Lembrete mensal (dia 1)', note: 'Um por grupo e um por amigo.', notifications: debtReminders() },
      {
        title: 'Lembrar (manual)',
        notifications: [
          {
            userId: ME,
            title: '🔔 Lembrete de dívida',
            body: 'Ana lembra-te que deves 23,40 €.',
            url: '/people',
            tag: '/people',
            icon: notificationAvatarUrl({ id: 'ana', name: 'Ana' }),
          },
        ],
      },
    ],
  },
];

// --- UI ---------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-hairline pt-6">
      <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className="font-mono text-xs text-ink text-right break-all">{value}</span>
    </div>
  );
}

/** Uma notificação tal como aparece no telemóvel, + os metadados. */
function Preview({ n, step }: { n: OutgoingNotification; step?: number }) {
  return (
    <div className="rounded-2xl bg-surface border border-hairline shadow-sm p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-ink text-sm">{n.title}</p>
            <span className="text-[11px] text-ink-faint shrink-0">{step ? `${step}.º` : 'agora'}</span>
          </div>
          <p className="text-sm text-ink-soft mt-0.5">{n.body}</p>
        </div>
        {/* A imagem grande do Android (à direita), como no telemóvel. */}
        {n.icon && (
          // eslint-disable-next-line @next/next/no-img-element -- imagem do aviso, tal como vai
          <img src={n.icon} alt="" className="w-10 h-10 rounded-full shrink-0" />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-faint">
        <span className="truncate">{n.url}</span>
        <span>·</span>
        <span className="truncate">tag {n.tag}</span>
        {n.quiet && <Badge variant="neutral">silenciosa</Badge>}
      </div>
    </div>
  );
}

const STAGES: { stage: NotificationPromptStage; label: string; orderItem?: boolean }[] = [
  { stage: 'install', label: 'Instalar' },
  { stage: 'install', label: 'Instalar (depois de um pedido)', orderItem: true },
  { stage: 'open-in-browser', label: 'Abrir no browser' },
  { stage: 'permission', label: 'Permissão' },
  { stage: 'permission', label: 'Permissão (depois de um pedido)', orderItem: true },
];

export default function DevNotificationsPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const { showToast } = useToast();
  const { user } = useUser();
  const { status, support, requestPermission } = useNotificationPermission();
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<(typeof STAGES)[number] | null>(null);

  const refreshSubscription = useCallback(async () => {
    if (!support.pushCapable) return setEndpoint(null);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setEndpoint(sub?.endpoint ?? null);
  }, [support.pushCapable]);

  useEffect(() => {
    void Promise.resolve().then(refreshSubscription);
  }, [refreshSubscription]);

  const send = async (n: OutgoingNotification) => {
    const res = await fetch('/api/dev/notifications', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag, quiet: n.quiet, icon: n.icon }),
    });
    const data = (await res.json().catch(() => ({}))) as { sent?: number; failed?: number; error?: string };
    if (!res.ok) throw new Error(data.error ?? String(res.status));
    return data;
  };

  const sendScenario = async (s: Scenario) => {
    setBusy(s.title);
    try {
      let sent = 0;
      for (const [i, n] of s.notifications.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, 3000)); // dá para ver a substituição
        sent += (await send(n)).sent ?? 0;
      }
      showToast(sent > 0 ? `Enviada (${sent} envio${sent > 1 ? 's' : ''})` : 'Nenhum dispositivo ligado a esta conta', sent ? 'success' : 'error');
    } catch (error) {
      showToast(`Falhou: ${(error as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const enable = async () => {
    setBusy('enable');
    try {
      const { permission, subscribed } = await requestPermission();
      showToast(`Permissão: ${permission}${subscribed ? ' · ligado' : ''}`, subscribed ? 'success' : 'info');
    } finally {
      setBusy(null);
      void refreshSubscription();
    }
  };

  const reconnect = async () => {
    setBusy('reconnect');
    try {
      showToast((await subscribeToPushNotifications()) ? 'Dispositivo ligado à conta' : 'Não foi possível ligar', 'info');
    } finally {
      setBusy(null);
      void refreshSubscription();
    }
  };

  const resetPromptState = () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('notif-prompt:') || key.startsWith('notification-prompt-handled:')) localStorage.removeItem(key);
      }
      showToast('Estado do pedido reposto', 'success');
    } catch {
      showToast('Sem acesso ao armazenamento', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-app text-ink">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-sm text-ink-soft">
            Vista como {NAMES[ME]} (o recetor). &quot;Enviar para mim&quot; manda para os dispositivos da conta{' '}
            <strong>{user?.name ?? 'sem sessão'}</strong>.
          </p>
        </header>

        <div className="flex flex-col gap-10">
          <Section title="Este dispositivo">
            <div className="card p-4 divide-y divide-hairline">
              <Row label="Plataforma" value={support.platform} />
              <Row label="App instalada" value={support.standalone ? 'sim' : 'não'} />
              <Row label="Dentro de outra app" value={support.inAppBrowser ? 'sim' : 'não'} />
              <Row label="Push disponível" value={support.pushCapable ? 'sim' : support.iosNeedsInstall ? 'só depois de instalar' : 'não'} />
              <Row label="Permissão" value={status} />
              <Row
                label="Ligado à conta"
                value={endpoint === undefined ? '…' : endpoint ? `${new URL(endpoint).host} ✓` : 'não'}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {status === 'default' && (
                <Button size="sm" loading={busy === 'enable'} onClick={enable}>
                  Ativar notificações
                </Button>
              )}
              {status === 'granted' && (
                <Button size="sm" variant="secondary" loading={busy === 'reconnect'} onClick={reconnect}>
                  Voltar a ligar este dispositivo
                </Button>
              )}
            </div>
          </Section>

          {SCENARIOS.map(({ section, items }) => (
            <Section key={section} title={section}>
              <div className="grid gap-6 sm:grid-cols-2">
                {items.map((s) => (
                  <div key={s.title} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{s.title}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === s.title}
                        disabled={!user || busy !== null}
                        onClick={() => sendScenario(s)}
                      >
                        <Icon name="send" className="text-sm" />
                        {s.notifications.length > 1 ? 'Enviar a sequência' : 'Enviar para mim'}
                      </Button>
                    </div>
                    {s.note && <p className="text-xs text-ink-faint">{s.note}</p>}
                    {s.notifications.map((n, i) => (
                      <Preview key={i} n={n} step={s.notifications.length > 1 ? i + 1 : undefined} />
                    ))}
                    {s.notifications.length === 0 && <p className="text-xs text-danger">Nenhuma notificação gerada.</p>}
                  </div>
                ))}
              </div>
            </Section>
          ))}

          <Section title="Ecrã que pede para ativar">
            <p className="mb-3 text-xs text-ink-faint">
              &quot;Talvez mais tarde&quot; e &quot;Ativar&quot; mexem no estado real deste dispositivo (adiamentos). Usa
              &quot;Repor&quot; para voltar ao início.
            </p>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <Button key={s.label} size="sm" variant="secondary" onClick={() => setPrompt(s)}>
                  {s.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={resetPromptState}>
                Repor estado do pedido
              </Button>
            </div>
          </Section>
        </div>
      </div>

      {prompt && (
        <NotificationInstallPrompt
          stage={prompt.stage}
          orderItem={prompt.orderItem ? { name: 'Leite', quantity: 2 } : null}
          onClose={() => setPrompt(null)}
        />
      )}
    </div>
  );
}
