import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import webPush from 'web-push';
import type PocketBase from 'pocketbase';
import type { OutgoingNotification } from './build';

/**
 * Envio Web Push (só servidor). Um formato serve todos:
 *
 * - **Declarative Web Push** (`web_push: 8030` + `notification`) — o iPhone/
 *   iPad (iOS 18.4+) e o Safari do Mac mostram a notificação SEM depender do
 *   service worker. É a garantia de que nunca há um push "silencioso" (que o
 *   iOS castiga cancelando a subscrição) mesmo que o SW falhe ou esteja a
 *   meio de uma atualização.
 * - Os mesmos campos no topo (`title`, `body`, `url`, `tag`) para o
 *   `public/sw.js` nos browsers que ainda não conhecem o formato declarativo.
 */

const MAX_TITLE = 120;
const MAX_BODY = 400;

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(publicKey && privateKey);
  if (configured) webPush.setVapidDetails('mailto:admin@orderitall.com', publicKey!, privateKey!);
  else console.warn('VAPID keys missing — pushes não vão ser enviados.');
  return configured;
}

/**
 * @param origin Endereço da app neste dispositivo (onde ativou as
 *   notificações) — o formato declarativo precisa de um link absoluto. Sem
 *   ele (subscrições antigas), vai só o formato para o service worker, que
 *   resolve o caminho relativo sozinho.
 */
export function pushPayload(
  n: Pick<OutgoingNotification, 'title' | 'body' | 'url' | 'tag' | 'quiet' | 'icon'>,
  origin: string | null,
): string {
  const title = n.title.trim().slice(0, MAX_TITLE);
  const body = n.body.trim().slice(0, MAX_BODY);
  return JSON.stringify({
    ...(origin && {
      web_push: 8030,
      notification: {
        title,
        body,
        navigate: new URL(n.url, origin).href,
        tag: n.tag,
        lang: 'pt-PT',
        silent: Boolean(n.quiet),
      },
    }),
    // Para o service worker (browsers sem o formato declarativo).
    title,
    body,
    url: n.url,
    tag: n.tag,
    quiet: Boolean(n.quiet),
    // Só a cara de quem fez a ação; sem ela, nenhuma (o ícone da app já lá está).
    ...(n.icon && { icon: n.icon }),
  });
}

function validOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Testes E2E (`e2e/`, só em dev): se a pasta `.e2e/` existir, cada aviso que
 * ia ser enviado fica também escrito em `.e2e/notifications.jsonl` — o teste
 * confirma quem recebeu o quê sem precisar de telemóveis com push.
 */
function captureForE2E(notifications: OutgoingNotification[]): void {
  if (process.env.NODE_ENV === 'production' || notifications.length === 0) return;
  const dir = path.join(process.cwd(), '.e2e');
  if (!existsSync(dir)) return;
  const at = new Date().toISOString();
  appendFileSync(path.join(dir, 'notifications.jsonl'), notifications.map((n) => JSON.stringify({ at, ...n }) + '\n').join(''));
}

export interface SendResult {
  sent: number;
  failed: number;
  /** Subscrições apagadas por já não existirem (410/404). */
  removed: number;
}

/**
 * Envia cada notificação a todos os dispositivos da pessoa. O link de cada
 * uma aponta para o endereço onde AQUELE dispositivo ativou as notificações
 * (a app pode ter vários URLs); `fallbackOrigin` serve as subscrições antigas
 * que ainda não o guardaram.
 */
export async function sendNotifications(
  pb: PocketBase,
  notifications: OutgoingNotification[],
  fallbackOrigin?: string | null,
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, removed: 0 };
  captureForE2E(notifications);
  if (notifications.length === 0 || !configure()) return result;

  const userIds = [...new Set(notifications.map((n) => n.userId))];
  const filter = userIds.map((_, i) => `user = {:u${i}}`).join(' || ');
  const params = Object.fromEntries(userIds.map((id, i) => [`u${i}`, id]));
  const subs = await pb.collection('push_subscriptions').getFullList<{
    id: string;
    user: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    origin?: string;
  }>({ filter: pb.filter(filter, params) });
  const fallback = validOrigin(fallbackOrigin) ?? validOrigin(process.env.NEXT_PUBLIC_APP_URL);

  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.user, [...(byUser.get(s.user) ?? []), s]);

  const gone = new Set<string>();
  await Promise.all(
    notifications.flatMap((n) =>
      (byUser.get(n.userId) ?? []).map((sub) =>
        webPush
          .sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload(n, validOrigin(sub.origin) ?? fallback), {
            TTL: 60 * 60 * 24, // um dia: um aviso de ontem ainda serve, de há uma semana não
            urgency: 'normal',
            topic: n.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
          })
          .then(() => {
            result.sent += 1;
          })
          .catch((err: { statusCode?: number }) => {
            if (err.statusCode === 410 || err.statusCode === 404) gone.add(sub.id);
            else {
              result.failed += 1;
              console.error('Push send error:', err);
            }
          }),
      ),
    ),
  );

  await Promise.all([...gone].map((id) => pb.collection('push_subscriptions').delete(id).catch(() => {})));
  result.removed = gone.size;
  return result;
}
