import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { PB_ID_RE, requireUserId, unauthorized } from '@/lib/serverAuth';
import { CLIENT_EVENT_TYPES, dispatchEvent, eventFromRecord } from '@/lib/notifications/dispatch';
import type { NotificationEventType } from '@/lib/notifications/build';

/**
 * "Acabei de gravar X" → avisos a quem interessa. A app chama isto logo a
 * seguir a uma escrita com sucesso (`notifyEvent` em `src/lib/notify.ts`); só
 * diz o tipo e o id — quem avisar e o que dizer decide o servidor, a partir do
 * registo (`src/lib/notifications/dispatch.ts`). Quem chama tem de ser quem fez
 * a alteração, há menos de 10 minutos; a mesma alteração só avisa uma vez.
 */
export async function POST(request: Request) {
  const callerId = await requireUserId(request);
  if (!callerId) return unauthorized();

  const { type, recordId } = (await request.json().catch(() => ({}))) as { type?: unknown; recordId?: unknown };
  if (
    typeof type !== 'string' ||
    !CLIENT_EVENT_TYPES.includes(type as NotificationEventType) ||
    typeof recordId !== 'string' ||
    !PB_ID_RE.test(recordId)
  ) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  }

  try {
    const pb = await getAdminPb();
    const event = await eventFromRecord(pb, type as NotificationEventType, recordId, callerId);
    if (!event) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    const result = await dispatchEvent(pb, event, request.headers.get('origin'));
    return NextResponse.json(result);
  } catch (error) {
    console.error('notifications/event failed:', error);
    return NextResponse.json({ error: 'Falhou' }, { status: 500 });
  }
}
