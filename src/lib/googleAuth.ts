import { pb } from '@/lib/pocketbase';
import type { RecordModel } from 'pocketbase';
import { getAppOAuthRedirectUrl as getSharedOAuthRedirectUrl } from '@/lib/googleOAuthShared';
import {
  getInAppBrowserMessage,
  isDisallowedOAuthBrowser,
  openInSystemBrowser,
} from '@/lib/oauthBrowser';

const PROVIDER_STORAGE_KEY = 'oauth_provider';
const HINTS_STORAGE_KEY = 'oauth_profile_hints';
const REDIRECT_STORAGE_KEY = 'oauth_redirect';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export interface OAuthProfileHints {
  oauthAvatarUrl?: string;
}

export interface OAuthProviderSession {
  name: string;
  state: string;
  codeVerifier: string;
}

export interface OAuthMeta {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  avatarURL?: string;
  isNew?: boolean;
  rawUser?: { picture?: string; name?: string };
}

export interface GoogleOAuthResult {
  record: Record<string, unknown>;
  meta: OAuthMeta;
  redirectPath?: string | null;
}

export function getAppOAuthRedirectUrl(): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  return getSharedOAuthRedirectUrl(origin);
}

export function setOAuthRedirectPath(path: string | null): void {
  if (typeof window === 'undefined') return;
  if (path) {
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, path);
  } else {
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  }
}

export function consumeOAuthRedirectPath(): string | null {
  if (typeof window === 'undefined') return null;
  const path = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
  sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  return path;
}

export function saveOAuthProfileHints(meta: OAuthMeta): void {
  if (typeof window === 'undefined') return;
  const avatar =
    meta.avatarUrl || meta.avatarURL || meta.rawUser?.picture;
  if (!avatar?.trim()) return;
  sessionStorage.setItem(
    HINTS_STORAGE_KEY,
    JSON.stringify({ oauthAvatarUrl: avatar.trim() } satisfies OAuthProfileHints)
  );
}

export function loadOAuthProfileHints(): OAuthProfileHints | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(HINTS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthProfileHints;
  } catch {
    return null;
  }
}

export function clearOAuthProfileHints(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(HINTS_STORAGE_KEY);
}

export function needsProfileSetup(
  record: { name?: string },
  meta: OAuthMeta
): boolean {
  if (!record.name?.trim()) return true;
  return meta.isNew === true;
}

export type GoogleOAuthStartResult = 'redirect' | 'external';

export async function startGoogleOAuth(
  redirectPath?: string | null
): Promise<GoogleOAuthStartResult> {
  const params = new URLSearchParams();
  if (redirectPath) params.set('redirect', redirectPath);
  const startPath = `/api/auth/google/start${params.toString() ? `?${params}` : ''}`;

  if (isDisallowedOAuthBrowser()) {
    openInSystemBrowser(`${window.location.origin}${startPath}`);
    return 'external';
  }

  window.location.href = startPath;
  return 'redirect';
}

export function getGoogleOAuthInAppBrowserMessage(): string {
  return getInAppBrowserMessage();
}

export async function completeGoogleOAuth(
  code: string,
  state: string
): Promise<GoogleOAuthResult> {
  const res = await fetch('/api/auth/google/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  });

  if (res.ok) {
    const data = (await res.json()) as {
      token: string;
      record: Record<string, unknown>;
      meta: OAuthMeta;
      redirectPath?: string | null;
    };
    pb.authStore.save(data.token, data.record as RecordModel);
    return {
      record: data.record,
      meta: data.meta,
      redirectPath: data.redirectPath ?? null,
    };
  }

  const apiError = await res.json().catch(() => null);
  const apiMessage =
    apiError && typeof apiError.error === 'string' ? apiError.error : null;

  const raw = sessionStorage.getItem(PROVIDER_STORAGE_KEY);
  if (!raw) {
    throw new Error(
      apiMessage || 'Sessão OAuth expirada. Tenta iniciar sessão outra vez.'
    );
  }

  let provider: OAuthProviderSession;
  try {
    provider = JSON.parse(raw) as OAuthProviderSession;
  } catch {
    throw new Error('Sessão OAuth inválida');
  }

  if (provider.state !== state) {
    throw new Error('Estado OAuth inválido');
  }

  const redirectUrl = getAppOAuthRedirectUrl();
  const authData = await pb.collection('users').authWithOAuth2Code(
    provider.name,
    code,
    provider.codeVerifier,
    redirectUrl
  );

  sessionStorage.removeItem(PROVIDER_STORAGE_KEY);

  const record = authData.record as Record<string, unknown>;
  const meta = (authData.meta ?? {}) as OAuthMeta;

  return {
    record,
    meta,
    redirectPath: consumeOAuthRedirectPath(),
  };
}

export async function urlToAvatarFile(url: string): Promise<File | null> {
  const loaded = await loadGoogleAvatarFromUrl(url);
  return loaded?.file ?? null;
}

export function buildPostAuthPath(
  needsSetup: boolean,
  redirectPath: string | null
): string {
  if (needsSetup) {
    return redirectPath
      ? `/auth/profile-setup?redirect=${encodeURIComponent(redirectPath)}`
      : '/auth/profile-setup';
  }
  return redirectPath || '/groups';
}

/** Request higher-res Google avatar when URL uses a small size suffix. */
export function normalizeGoogleAvatarUrl(url: string): string {
  return url.replace(/=s\d+(-c)?$/, '=s256-c');
}

async function fetchGoogleAvatarBlob(url: string): Promise<Blob | null> {
  try {
    const normalized = normalizeGoogleAvatarUrl(url);
    const res = await fetch(
      `/api/auth/google-avatar?url=${encodeURIComponent(normalized)}`
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > MAX_AVATAR_BYTES) return null;
    return blob;
  } catch {
    return null;
  }
}

export async function loadGoogleAvatarFromUrl(
  url: string
): Promise<{ previewUrl: string; file: File } | null> {
  const blob = await fetchGoogleAvatarBlob(url);
  if (!blob) return null;
  const type = blob.type || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : 'jpg';
  const file = new File([blob], `google-avatar.${ext}`, { type });
  return { previewUrl: URL.createObjectURL(blob), file };
}
