export type OAuthBrowserPlatform = 'android' | 'ios' | 'desktop';

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/** Google blocks OAuth in embedded WebViews and many in-app browsers. */
export function isDisallowedOAuthBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';

  // Android WebView
  if (/; wv\)/.test(ua)) return true;

  // Google app embedded browser (Android + iOS)
  if (/GSA\//i.test(ua)) return true;

  // Social / messaging in-app browsers
  if (
    /(FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|Pinterest|MicroMessenger|BytedanceWebview|WhatsApp|Telegram|Discord)/i.test(
      ua
    )
  ) {
    return true;
  }

  const isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(ua);

  // Installed PWA on mobile — Google OAuth must run in the system browser,
  // not inside the standalone app shell (Error 403: disallowed_useragent).
  if (isMobile && isStandaloneDisplayMode()) return true;

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (!isIOS) return false;

  // iOS Chrome/Firefox/Edge are full browsers Google allows.
  if (/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua)) return false;

  const isSafari = /Safari/i.test(ua);
  if (isSafari) return false;

  // Other embedded iOS browsers (non-Safari, non-standalone handled above).
  return true;
}

export function getOAuthBrowserPlatform(): OAuthBrowserPlatform {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

export function openInSystemBrowser(url: string): void {
  const platform = getOAuthBrowserPlatform();

  if (platform === 'android') {
    const stripped = url.replace(/^https?:\/\//, '');
    window.location.href = `intent://${stripped}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
    return;
  }

  if (platform === 'ios') {
    const opened = window.open(url, '_blank');
    if (!opened) window.location.href = url;
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer') ?? (window.location.href = url);
}

export function getInAppBrowserMessage(): string {
  const platform = getOAuthBrowserPlatform();
  if (isStandaloneDisplayMode()) {
    if (platform === 'ios') {
      const host =
        typeof window !== 'undefined' ? window.location.host : 'este site';
      return `O Google não permite login dentro da app instalada. Abre ${host} no Safari e entra a partir daí.`;
    }
    if (platform === 'android') {
      return 'O Google exige o Chrome. A abrir o login no browser do sistema…';
    }
  }
  if (platform === 'ios') {
    return 'O Google exige um browser seguro. Abre esta página no Safari (menu ⋯ → Abrir no Safari) e tenta outra vez.';
  }
  if (platform === 'android') {
    return 'O Google exige um browser seguro. A abrir no Chrome…';
  }
  return 'O Google exige um browser seguro. Abre esta página num browser completo e tenta outra vez.';
}

export function isStandalonePwa(): boolean {
  return isStandaloneDisplayMode();
}
