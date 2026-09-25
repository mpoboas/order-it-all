import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { getAdminPb } from '@/lib/pbAdmin';
import { PB_ID_RE, requireUserId, unauthorized } from '@/lib/serverAuth';

// Configure Web Push
const vapidKeys = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
};

if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webPush.setVapidDetails(
    'mailto:admin@orderitall.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} else {
  console.warn('VAPID keys missing at module load — pushes vão falhar em silêncio (webPush.sendNotification rejeita, o .catch() por-subscrição só regista no log).');
}

const MAX_TITLE = 120;
const MAX_MESSAGE = 400;

/** Só caminhos da própria app — nunca um link externo numa notificação. */
function safeAppPath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')
    ? url
    : '/groups';
}

/**
 * Envia um push a utilizadores com quem quem chama partilha um grupo ou uma
 * amizade. Exige sessão (`Authorization`); os destinatários pedidos são
 * filtrados por essa relação — nunca se notifica um id arbitrário.
 */
export async function POST(request: Request) {
  try {
    const callerId = await requireUserId(request);
    if (!callerId) return unauthorized();

    const body = await request.json();
    const { groupId, title, message, url, targetUserIds, excludeUserId } = body;

    if (typeof title !== 'string' || typeof message !== 'string' || !title.trim() || !message.trim()) {
      return NextResponse.json({ error: 'Missing title or message' }, { status: 400 });
    }

    const pb = await getAdminPb();

    // Com quem é que quem chama tem relação?
    const [groups, friendships] = await Promise.all([
      pb.collection('groups').getFullList<{ id: string; members: string[] }>({
        filter: pb.filter('members.id ?= {:uid}', { uid: callerId }),
        fields: 'id,members',
      }),
      pb.collection('friendships').getFullList<{ user_a: string; user_b: string }>({
        filter: pb.filter('user_a = {:uid} || user_b = {:uid}', { uid: callerId }),
        fields: 'user_a,user_b',
      }),
    ]);

    let recipients: string[] = [];
    if (Array.isArray(targetUserIds)) {
      const allowed = new Set([
        ...groups.flatMap((g) => g.members),
        ...friendships.flatMap((f) => [f.user_a, f.user_b]),
      ]);
      recipients = targetUserIds.filter(
        (id: unknown): id is string => typeof id === 'string' && PB_ID_RE.test(id) && allowed.has(id),
      );
    } else if (typeof groupId === 'string') {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      recipients = group.members;
    }

    // Quem disparou a ação já vê o resultado no ecrã — não se auto-notifica
    // (mesma política dos toasts: otimista = silêncio no sucesso).
    recipients = [...new Set(recipients)].filter((id) => id !== callerId && id !== excludeUserId);

    if (recipients.length === 0) {
      return NextResponse.json({ message: 'No recipients found' });
    }

    const filter = recipients.map((_, i) => `user = {:u${i}}`).join(' || ');
    const params = Object.fromEntries(recipients.map((id, i) => [`u${i}`, id]));
    const subscriptions = await pb.collection('push_subscriptions').getFullList({
      filter: pb.filter(filter, params),
    });

    const target = safeAppPath(url);
    const payload = JSON.stringify({
      title: title.trim().slice(0, MAX_TITLE),
      body: message.trim().slice(0, MAX_MESSAGE),
      url: target,
      icon: '/android-chrome-192x192.png',
      // Agrupa no telemóvel avisos sucessivos sobre o mesmo destino (ex.: a
      // mesma viagem) em vez de os empilhar — ver `tag`/`renotify` no sw.js.
      tag: target,
    });

    await Promise.all(
      subscriptions.map((sub) =>
        webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload).catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription/Endpoint is gone, delete from DB
            await pb.collection('push_subscriptions').delete(sub.id).catch(() => {});
          } else {
            console.error('Push send error:', err);
          }
        }),
      ),
    );

    return NextResponse.json({ success: true, count: subscriptions.length });
  } catch (error) {
    // Detalhe só no log do servidor — não devolver respostas internas do PB.
    console.error('Notification API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
