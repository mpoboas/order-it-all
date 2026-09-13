import { pb } from '@/lib/pocketbase';
import { hasReachedInstallValueMoment } from '@/lib/installValueMoment';

/**
 * Estado do ecrã inteiro que pede para ativar notificações
 * (`NotificationInstallPrompt`) — mostrado uma vez, nunca mais, assim que
 * o utilizador tocar em qualquer botão (ativar ou "Talvez mais tarde").
 * Por utilizador, não por dispositivo/sessão.
 */
function storageKey(): string | null {
  const userId = pb.authStore.model?.id;
  return userId ? `notification-prompt-handled:${userId}` : null;
}

export function markNotificationPromptHandled(): void {
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

function hasHandledNotificationPrompt(): boolean {
  const key = storageKey();
  if (!key) return true;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Só decide SE vale a pena montar o `NotificationInstallPrompt" — QUAL fase
 * mostrar (instalar vs. pedir permissão a sério), ou se afinal não há nada
 * para oferecer (já instalado e permissão já decidida), fica a cargo do
 * próprio componente, que sabe a plataforma e o estado de instalação. Não
 * filtra por `Notification.permission` aqui: no Android/desktop a fase de
 * instalar deve aparecer mesmo que a permissão já esteja decidida (ex.:
 * recusada num teste anterior) — instalar continua a ser útil por si só.
 *
 * @param requireValueMoment Quando `true` (omissão), só mostra depois de um
 *   momento de valor real (primeiro pedido ou primeiro grupo/viagem —
 *   `hasReachedInstallValueMoment`). Passar `false` nos sítios onde a
 *   própria ação que acabou de acontecer JÁ é esse momento (ex.: mesmo
 *   depois de criar o pedido) — poupa uma leitura redundante.
 */
export function shouldShowNotificationPrompt(requireValueMoment = true): boolean {
  if (typeof window === 'undefined') return false;
  if (hasHandledNotificationPrompt()) return false;
  if (requireValueMoment && !hasReachedInstallValueMoment()) return false;
  return true;
}
