/**
 * Fase 4 do plano de onboarding (ver memória `onboarding-pwa-install`): o
 * Chrome/Edge/Android só disparam `beforeinstallprompt` uma vez, cedo, e se
 * não guardarmos o evento (com `preventDefault`) o mini-infobar nativo do
 * browser aparece sozinho, sem controlo do timing. Guardamos o evento aqui
 * para disparar mais tarde, num momento de valor real (primeiro pedido,
 * primeiro grupo/viagem criado) em vez de ao calhar do browser.
 *
 * iOS nunca dispara este evento — lá a instalação é sempre manual (ver
 * `useInstallPrompt`).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredEvent: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredEvent = null;
    installed = true;
    notify();
  });
}

export const installPromptStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot: () => deferredEvent !== null && !installed,
  getServerSnapshot: () => false,
};

/** Dispara o prompt nativo guardado — só existe uma vez por evento capturado. */
export async function promptNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredEvent) return 'unavailable';
  const event = deferredEvent;
  deferredEvent = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}
