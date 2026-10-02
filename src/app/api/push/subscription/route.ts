import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { requireUserId, unauthorized } from '@/lib/serverAuth';

/**
 * Grava/apaga a subscrição push DESTE dispositivo para quem tem sessão.
 *
 * Um `endpoint` identifica um browser/app num dispositivo — só pode pertencer
 * a uma conta. Se outra conta o tinha (mesmo telemóvel, sessão trocada sem
 * logout, ou logout que falhou), essa linha sai: senão a pessoa anterior
 * continuava a receber aqui as notificações da nova, e vice-versa. Feito no
 * servidor porque as regras do PocketBase (bem) não deixam apagar linhas de
 * outros utilizadores a partir do cliente.
 */

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

function parse(body: Body): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const { endpoint, keys } = body ?? {};
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return null;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const sub = parse(await request.json().catch(() => ({})));
  if (!sub) return NextResponse.json({ error: 'Subscrição inválida' }, { status: 400 });
  // O endereço da app neste dispositivo — é para lá que os toques nas
  // notificações levam (a app pode ter mais do que um URL).
  const origin = request.headers.get('origin') ?? new URL(request.url).origin;

  try {
    const pb = await getAdminPb();
    const rows = await pb.collection('push_subscriptions').getFullList<{ id: string; user: string }>({
      filter: pb.filter('endpoint = {:endpoint}', { endpoint: sub.endpoint }),
      fields: 'id,user',
    });

    const mine = rows.find((r) => r.user === userId);
    await Promise.all(rows.filter((r) => r !== mine).map((r) => pb.collection('push_subscriptions').delete(r.id)));

    if (mine) {
      // As chaves mudam quando o browser renova a subscrição no mesmo endpoint;
      // o endereço, se a pessoa passou a usar outro URL da app.
      await pb.collection('push_subscriptions').update(mine.id, { keys: sub.keys, origin });
    } else {
      await pb.collection('push_subscriptions').create({ user: userId, endpoint: sub.endpoint, keys: sub.keys, origin });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('push subscription save failed:', error);
    return NextResponse.json({ error: 'Não foi possível guardar' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const { endpoint } = (await request.json().catch(() => ({}))) as Body;
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'Falta o endpoint' }, { status: 400 });

  try {
    const pb = await getAdminPb();
    const rows = await pb.collection('push_subscriptions').getFullList<{ id: string }>({
      filter: pb.filter('endpoint = {:endpoint} && user = {:user}', { endpoint, user: userId }),
      fields: 'id',
    });
    await Promise.all(rows.map((r) => pb.collection('push_subscriptions').delete(r.id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('push subscription delete failed:', error);
    return NextResponse.json({ error: 'Não foi possível apagar' }, { status: 500 });
  }
}
