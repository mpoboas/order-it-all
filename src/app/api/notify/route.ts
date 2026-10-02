import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { PB_ID_RE, requireUserId, unauthorized } from '@/lib/serverAuth';
import { sendNotifications } from '@/lib/notifications/send';
import { notificationAvatarUrl } from '@/lib/notifications/avatar';

/** Só caminhos da própria app — nunca um link externo numa notificação. */
function safeAppPath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')
    ? url
    : '/groups';
}

/**
 * Mensagem escrita pela própria pessoa, que não corresponde a uma alteração de
 * dados (hoje, só o "Lembrar" de uma dívida — `sendDirectMessage`). Os avisos
 * de alterações (despesas, viagens, amizades…) vão por
 * `/api/notifications/event`. Exige sessão; os destinatários são filtrados a
 * quem partilha um grupo ou uma amizade com quem envia — nunca um id qualquer.
 */
export async function POST(request: Request) {
  try {
    const callerId = await requireUserId(request);
    if (!callerId) return unauthorized();

    const body = await request.json();
    const { title, message, url, targetUserIds } = body;

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

    const allowed = new Set([
      ...groups.flatMap((g) => g.members),
      ...friendships.flatMap((f) => [f.user_a, f.user_b]),
    ]);
    const recipients = [
      ...new Set(
        (Array.isArray(targetUserIds) ? targetUserIds : []).filter(
          (id: unknown): id is string => typeof id === 'string' && PB_ID_RE.test(id) && allowed.has(id),
        ),
      ),
    ].filter((id) => id !== callerId);

    if (recipients.length === 0) {
      return NextResponse.json({ message: 'No recipients found' });
    }

    const target = safeAppPath(url);
    const sender = await pb
      .collection('users')
      .getOne<{ id: string; name: string; avatar?: string }>(callerId, { fields: 'id,name,avatar' })
      .catch(() => undefined);
    const icon = notificationAvatarUrl(sender);
    const result = await sendNotifications(
      pb,
      recipients.map((userId) => ({ userId, title, body: message, url: target, tag: target, icon })),
      request.headers.get('origin'),
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // Detalhe só no log do servidor — não devolver respostas internas do PB.
    console.error('Notification API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
