export const GOOGLE_OAUTH_PROVIDER = 'google';

export const GOOGLE_OAUTH_COOKIES = {
  state: 'google_oauth_state',
  codeVerifier: 'google_oauth_verifier',
  redirect: 'google_oauth_redirect',
} as const;

export const GOOGLE_OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 600,
  path: '/',
};

export function getPocketBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top'
  );
}

export function getAppOAuthRedirectUrl(origin?: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    origin?.replace(/\/$/, '') ||
    '';
  return `${base}/auth/oauth/callback`;
}
