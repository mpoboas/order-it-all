'use client';

import { useSyncExternalStore } from 'react';
import { installPromptStore, promptNativeInstall } from '@/lib/installPrompt';
import { getOAuthBrowserPlatform, isStandalonePwa } from '@/lib/oauthBrowser';

/**
 * Estado de instalação da PWA, partilhado por qualquer soft-ask (Fase 4 do
 * plano de onboarding — ver memória `onboarding-pwa-install`).
 *
 * - Android/desktop: `canInstall` fica true quando o browser guardou o
 *   `beforeinstallprompt`; `promptInstall()` dispara-o.
 * - iOS: nunca há prompt nativo — `platform === 'ios' && !isStandalone`
 *   identifica quem precisa das instruções manuais.
 */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.getSnapshot,
    installPromptStore.getServerSnapshot,
  );

  const platform = typeof window === 'undefined' ? 'desktop' : getOAuthBrowserPlatform();
  const isStandalone = typeof window !== 'undefined' && isStandalonePwa();
  const iosManualInstall = platform === 'ios' && !isStandalone;

  return { canInstall, platform, isStandalone, iosManualInstall, promptInstall: promptNativeInstall };
}
