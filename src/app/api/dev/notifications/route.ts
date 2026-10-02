import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { requireUserId, unauthorized } from '@/lib/serverAuth';
import { sendNotifications } from '@/lib/notifications/send';

/**
 * Só em desenvolvimento (`/dev/notifications`): envia uma notificação de teste
 * para os dispositivos de QUEM CHAMA — nunca para mais ninguém. Mesmo envio
 * que as notificações reais (`send.ts`). Em produção, não existe.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { title, body: text, url, tag, quiet, icon } = body;
  if (typeof title !== 'string' || typeof text !== 'string' || typeof url !== 'string' || !url.startsWith('/')) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  }

  const pb = await getAdminPb();
  const result = await sendNotifications(
    pb,
    [
      {
        userId,
        title,
        body: text,
        url,
        tag: typeof tag === 'string' && tag ? tag : `dev:${Date.now()}`,
        quiet: quiet === true,
        icon: typeof icon === 'string' && icon ? icon : undefined,
      },
    ],
    request.headers.get('origin'),
  );
  return NextResponse.json(result);
}
