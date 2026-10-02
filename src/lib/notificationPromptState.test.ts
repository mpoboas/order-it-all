import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushSupport } from './pushSupport';

const env = vi.hoisted(() => ({
  support: {} as PushSupport,
  permission: 'default' as NotificationPermission,
  canInstall: false,
  valueMoment: false,
}));

vi.mock('@/lib/pocketbase', () => ({ pb: { authStore: { model: { id: 'user123456789ab' } } } }));
vi.mock('@/lib/pushSupport', () => ({ getPushSupport: () => env.support }));
vi.mock('@/lib/installPrompt', () => ({ installPromptStore: { getSnapshot: () => env.canInstall } }));
vi.mock('@/lib/installValueMoment', () => ({ hasReachedInstallValueMoment: () => env.valueMoment }));

import { markNotificationPromptDone, notificationPromptStage, snoozeNotificationPrompt } from './notificationPromptState';

const base: PushSupport = { platform: 'android', standalone: false, inAppBrowser: false, pushCapable: true, iosNeedsInstall: false };
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  env.support = { ...base };
  env.permission = 'default';
  env.canInstall = false;
  env.valueMoment = false;
  vi.useRealTimers();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal('Notification', { get permission() { return env.permission; } });
});

describe('que fase mostrar', () => {
  it('sem momento de valor não pede nada (fora da app instalada)', () => {
    expect(notificationPromptStage(false)).toBeNull();
  });

  it('app instalada conta como valor (iPhone a voltar pela WPA, armazenamento novo)', () => {
    env.support = { ...base, platform: 'ios', standalone: true };
    expect(notificationPromptStage(false)).toBe('permission');
  });

  it('iPhone no Safari: instalar primeiro', () => {
    env.support = { ...base, platform: 'ios', pushCapable: false, iosNeedsInstall: true };
    expect(notificationPromptStage(true)).toBe('install');
  });

  it('dentro do WhatsApp/Instagram: abrir no browser', () => {
    env.support = { ...base, platform: 'ios', inAppBrowser: true, pushCapable: false };
    expect(notificationPromptStage(true)).toBe('open-in-browser');
  });

  it('Android com instalação disponível: instalar; sem ela: permissão', () => {
    env.canInstall = true;
    expect(notificationPromptStage(true)).toBe('install');
    env.canInstall = false;
    expect(notificationPromptStage(true)).toBe('permission');
  });

  it('permissão já decidida ou browser sem push: nada', () => {
    env.permission = 'granted';
    expect(notificationPromptStage(true)).toBeNull();
    env.permission = 'denied';
    expect(notificationPromptStage(true)).toBeNull();
    env.support = { ...base, platform: 'desktop', pushCapable: false };
    expect(notificationPromptStage(true)).toBeNull();
  });
});

describe('"Talvez mais tarde"', () => {
  it('adia 3, 7 e 21 dias; à 4.ª recusa desiste', () => {
    vi.useFakeTimers();
    const day = 86_400_000;
    const t0 = new Date('2026-10-01T10:00:00Z').getTime();
    vi.setSystemTime(t0);

    snoozeNotificationPrompt();
    vi.setSystemTime(t0 + 2 * day);
    expect(notificationPromptStage(true)).toBeNull();
    vi.setSystemTime(t0 + 3 * day);
    expect(notificationPromptStage(true)).toBe('permission');

    snoozeNotificationPrompt();
    vi.setSystemTime(t0 + 9 * day);
    expect(notificationPromptStage(true)).toBeNull();
    vi.setSystemTime(t0 + 10 * day);
    expect(notificationPromptStage(true)).toBe('permission');

    snoozeNotificationPrompt();
    vi.setSystemTime(t0 + 10 * day + 21 * day);
    expect(notificationPromptStage(true)).toBe('permission');

    snoozeNotificationPrompt();
    vi.setSystemTime(t0 + 400 * day);
    expect(notificationPromptStage(true)).toBeNull();
  });

  it('decidir no pedido do sistema termina o assunto', () => {
    markNotificationPromptDone();
    expect(notificationPromptStage(true)).toBeNull();
  });

  it('a chave antiga ("tratado") conta como uma recusa, não como fim', () => {
    store.set('notification-prompt-handled:user123456789ab', '1');
    expect(notificationPromptStage(true)).toBe('permission');
  });
});
