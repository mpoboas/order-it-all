import { pb } from '@/lib/pocketbase';
import { hasReachedInstallValueMoment } from '@/lib/installValueMoment';
import { installPromptStore } from '@/lib/installPrompt';
import { getPushSupport } from '@/lib/pushSupport';

/**
 * Quando e como pedir para ativar notificações (`NotificationInstallPrompt`).
 * Por utilizador E por dispositivo (localStorage): cada telemóvel tem a sua
 * própria permissão — e no iPhone a app instalada nem partilha o armazenamento
 * com o Safari, por isso lá o pedido volta a aparecer, o que é o certo.
 *
 * "Talvez mais tarde" adia 3, depois 7, depois 21 dias; à 4.ª recusa não
 * volta a aparecer — continua disponível no Perfil. Decidir no pedido nativo
 * do sistema (permitir ou bloquear) termina o assunto para sempre.
 */

export type NotificationPromptStage =
  /** Instalar primeiro (iPhone fora da app, ou Android/desktop com instalação disponível). */
  | 'install'
  /** Browser dentro de outra app (WhatsApp, Instagram…): abrir no browser a sério. */
  | 'open-in-browser'
  /** Pedir a permissão a sério. */
  | 'permission';

const SNOOZE_DAYS = [3, 7, 21];
const DAY_MS = 86_400_000;

interface PromptState {
  dismissals: number;
  nextAt: number;
  done: boolean;
}

function storageKey(): string | null {
  const userId = pb.authStore.model?.id;
  return userId ? `notif-prompt:${userId}` : null;
}

function readState(): PromptState | null {
  const key = storageKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { dismissals: 0, nextAt: 0, done: false, ...JSON.parse(raw) };
    // Chave antiga (até set 2026): "tratado" contava como uma recusa.
    const legacy = localStorage.getItem(`notification-prompt-handled:${pb.authStore.model?.id}`);
    return { dismissals: legacy === '1' ? 1 : 0, nextAt: 0, done: false };
  } catch {
    return { dismissals: 0, nextAt: 0, done: false };
  }
}

function writeState(state: PromptState): void {
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* modo privado — o pedido volta a aparecer, não é grave */
  }
}

/** "Talvez mais tarde": adia (3, 7, 21 dias); à 4.ª vez, desiste. */
export function snoozeNotificationPrompt(): void {
  const state = readState();
  if (!state) return;
  const dismissals = state.dismissals + 1;
  const days = SNOOZE_DAYS[dismissals - 1];
  writeState({
    dismissals,
    nextAt: days ? Date.now() + days * DAY_MS : Infinity,
    done: !days,
  });
}

/** Permissão decidida no pedido do sistema (permitida ou bloqueada). */
export function markNotificationPromptDone(): void {
  const state = readState();
  if (!state) return;
  writeState({ ...state, done: true });
}

/**
 * Que fase mostrar agora — ou `null` se não há nada a pedir (já decidido,
 * adiado, sem suporte, ou ainda sem momento de valor).
 *
 * @param hasValue Já houve um momento de valor que justifique pedir (fez um
 *   pedido, criou algo, pertence a um grupo…). A app instalada conta sempre
 *   como valor — instalar é o sinal mais forte que há.
 */
export function notificationPromptStage(hasValue: boolean): NotificationPromptStage | null {
  if (typeof window === 'undefined') return null;
  const state = readState();
  if (!state || state.done || Date.now() < state.nextAt) return null;

  const support = getPushSupport();
  if (!hasValue && !support.standalone && !hasReachedInstallValueMoment()) return null;

  if (support.inAppBrowser) return 'open-in-browser';
  if (support.iosNeedsInstall) return 'install';
  if (!support.pushCapable) return null;

  if (Notification.permission !== 'default') return null;
  const canInstall = installPromptStore.getSnapshot();
  return canInstall && !support.standalone ? 'install' : 'permission';
}
