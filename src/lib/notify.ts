import { authHeaders } from '@/lib/pocketbase';
import type { NotificationEventType } from '@/lib/notifications/build';

/**
 * Avisa o servidor de que ESTA pessoa acabou de gravar uma alteração — é ele
 * que decide a quem notificar e o que dizer (`/api/notifications/event`,
 * `src/lib/notifications/`). Chamar só depois de a escrita ter sucesso.
 * Falha em silêncio: um aviso que não sai nunca estraga a ação em si.
 * `keepalive` deixa o pedido acabar mesmo que a app feche logo a seguir.
 */
export function notifyEvent(type: Exclude<NotificationEventType, 'group.joined'>, recordId: string): void {
  void fetch('/api/notifications/event', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ type, recordId }),
    keepalive: true,
  }).catch((error) => console.error('notifyEvent failed', error));
}

/**
 * Mensagem escrita pela própria pessoa, que não corresponde a nenhuma
 * alteração de dados (hoje, só o "Lembrar" de uma dívida). O servidor só
 * entrega a quem partilha um grupo ou uma amizade com quem envia.
 */
export async function sendDirectMessage(opts: {
  targetUserIds: string[];
  title: string;
  message: string;
  url: string;
}): Promise<boolean> {
  if (opts.targetUserIds.length === 0) return false;
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(opts),
    });
    return res.ok;
  } catch (error) {
    console.error('sendDirectMessage failed', error);
    return false;
  }
}
