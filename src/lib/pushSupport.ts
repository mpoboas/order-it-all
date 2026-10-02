import { getOAuthBrowserPlatform, isStandalonePwa, type OAuthBrowserPlatform } from '@/lib/oauthBrowser';

/**
 * O que ESTE browser consegue fazer com notificações push — a base de todas
 * as decisões do pedido de notificações (onboarding, `/groups`, viagem,
 * Perfil). Cobre os casos que não são "Chrome normal":
 *
 * - iPhone/iPad no Safari (ou Chrome/Edge/Firefox do iOS, todos WebKit): push
 *   só existe depois de instalar no ecrã principal. No separador normal nem
 *   `Notification` existe.
 * - Browsers dentro de outras apps (WhatsApp, Instagram, Facebook, Gmail…):
 *   não instalam nem recebem push — o caminho é abrir no browser a sério.
 * - Browsers sem Push API (alguns Android antigos, Firefox com a opção
 *   desligada): nada a pedir.
 */
export interface PushSupport {
  platform: OAuthBrowserPlatform;
  /** A correr como app instalada (ecrã principal / WebAPK / desktop). */
  standalone: boolean;
  /** Browser embutido noutra app — não instala nem recebe push. */
  inAppBrowser: boolean;
  /** Tem tudo o que é preciso para pedir permissão e subscrever já. */
  pushCapable: boolean;
  /** iPhone/iPad fora da app instalada: tem de instalar primeiro. */
  iosNeedsInstall: boolean;
}

const IN_APP_UA =
  /(FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|Pinterest|MicroMessenger|BytedanceWebview|musical_ly|WhatsApp|Telegram|Discord|GSA\/)/i;

/** Browser dentro de outra app. No iOS, qualquer WebKit que não seja o Safari
 *  nem um dos browsers "a sério" (Chrome/Firefox/Edge/Opera) é um WebView. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (IN_APP_UA.test(ua)) return true;
  if (/; wv\)/.test(ua)) return true; // WebView do Android
  if (/iPhone|iPad|iPod/i.test(ua) && !isStandalonePwa()) {
    const realBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) || (/Safari\//i.test(ua) && /Version\//i.test(ua));
    return !realBrowser;
  }
  return false;
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') {
    return { platform: 'desktop', standalone: false, inAppBrowser: false, pushCapable: false, iosNeedsInstall: false };
  }
  const platform = getOAuthBrowserPlatform();
  const standalone = isStandalonePwa();
  const inAppBrowser = isInAppBrowser();
  const pushCapable =
    !inAppBrowser && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  return {
    platform,
    standalone,
    inAppBrowser,
    pushCapable,
    iosNeedsInstall: platform === 'ios' && !standalone && !inAppBrowser,
  };
}

/** Permissão atual, ou `unsupported` quando não há como a pedir aqui. */
export function currentPushPermission(): NotificationPermission | 'unsupported' {
  return getPushSupport().pushCapable ? Notification.permission : 'unsupported';
}
