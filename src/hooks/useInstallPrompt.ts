'use client';

import { useSyncExternalStore } from 'react';
import { installPromptStore, promptNativeInstall } from '@/lib/installPrompt';
import { getOAuthBrowserPlatform, isStandalonePwa, type OAuthBrowserPlatform } from '@/lib/oauthBrowser';

// Sem evento nenhum para subscrever — só precisamos do truque do
// `getServerSnapshot` do `useSyncExternalStore` para separar o valor
// "seguro" do SSR (sem `navigator`/`matchMedia`) do valor real do
// cliente, sem cair na regra `set-state-in-effect` (`setState` direto num
// efeito só por causa disto dispara-a nos hooks partilhados, apesar de
// ser exatamente o caso de uso que a própria regra diz servir).
function noopSubscribe() {
  return () => {};
}

/**
 * Estado de instalação da PWA, partilhado por qualquer soft-ask (Fase 4 do
 * plano de onboarding — ver memória `onboarding-pwa-install`).
 *
 * - Android/desktop: `canInstall` fica true quando o browser guardou o
 *   `beforeinstallprompt`; `promptInstall()` dispara-o.
 * - iOS: nunca há prompt nativo — `platform === 'ios' && !isStandalone`
 *   identifica quem precisa das instruções manuais.
 *
 * `platform`/`isStandalone` só se conseguem ler a sério no cliente
 * (`navigator.userAgent`/`matchMedia`) — lê-los logo no primeiro render
 * (ex.: `typeof window !== 'undefined' ? real : 'desktop'`) dava um valor
 * no SSR e outro na primeira passagem do cliente sempre que o valor real
 * difere do "seguro" (ex.: alguém já a usar a WPA instalada, ou em
 * iOS/Android) — "Hydration failed". `useSyncExternalStore` com
 * `getServerSnapshot` resolve isto tal como resolve `canInstall`: a
 * hidratação usa sempre o valor seguro, e só depois de montado é que o
 * React troca para o valor real do cliente (um re-render normal, já não
 * é hidratação).
 */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.getSnapshot,
    installPromptStore.getServerSnapshot,
  );

  const platform = useSyncExternalStore<OAuthBrowserPlatform>(
    noopSubscribe,
    getOAuthBrowserPlatform,
    () => 'desktop',
  );

  const isStandalone = useSyncExternalStore<boolean>(noopSubscribe, isStandalonePwa, () => false);

  const iosManualInstall = platform === 'ios' && !isStandalone;

  return { canInstall, platform, isStandalone, iosManualInstall, promptInstall: promptNativeInstall };
}
