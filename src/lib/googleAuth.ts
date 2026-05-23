import { pb } from '@/lib/pocketbase';

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
}

export function getAppOAuthRedirectUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/auth/oauth/callback`;
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

export async function startGoogleOAuth(redirectPath?: string | null): Promise<void> {
  setOAuthRedirectPath(redirectPath ?? null);

  const authMethods = await pb.collection('users').listAuthMethods();
  const providers = authMethods.oauth2?.providers ?? [];
  const provider = providers.find((p) => p.name === 'google');
  if (!provider) {
    throw new Error('Google OAuth não está configurado no PocketBase');
  }

  const session: OAuthProviderSession = {
    name: provider.name,
    state: provider.state,
    codeVerifier: provider.codeVerifier,
  };
  sessionStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(session));

  const redirectUrl = getAppOAuthRedirectUrl();
  window.location.href = provider.authURL + encodeURIComponent(redirectUrl);
}

export async function completeGoogleOAuth(
  code: string,
  state: string
): Promise<GoogleOAuthResult> {
  const raw = sessionStorage.getItem(PROVIDER_STORAGE_KEY);
  if (!raw) {
    throw new Error('Sessão OAuth expirada. Tenta iniciar sessão outra vez.');
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

  return { record, meta };
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
