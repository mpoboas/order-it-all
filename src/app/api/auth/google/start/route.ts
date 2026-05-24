import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
import {
  getAppOAuthRedirectUrl,
  getPocketBaseUrl,
  GOOGLE_OAUTH_COOKIES,
  GOOGLE_OAUTH_COOKIE_OPTS,
  GOOGLE_OAUTH_PROVIDER,
} from '@/lib/googleOAuthShared';

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const redirectPath = searchParams.get('redirect');

    const pb = new PocketBase(getPocketBaseUrl());
    const authMethods = await pb.collection('users').listAuthMethods();
    const provider = authMethods.oauth2?.providers?.find(
      (p) => p.name === GOOGLE_OAUTH_PROVIDER
    );

    if (!provider) {
      return NextResponse.json(
        { error: 'Google OAuth não está configurado no PocketBase' },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_OAUTH_COOKIES.state, provider.state, GOOGLE_OAUTH_COOKIE_OPTS);
    cookieStore.set(
      GOOGLE_OAUTH_COOKIES.codeVerifier,
      provider.codeVerifier,
      GOOGLE_OAUTH_COOKIE_OPTS
    );
    if (redirectPath) {
      cookieStore.set(
        GOOGLE_OAUTH_COOKIES.redirect,
        redirectPath,
        GOOGLE_OAUTH_COOKIE_OPTS
      );
    } else {
      cookieStore.delete(GOOGLE_OAUTH_COOKIES.redirect);
    }

    const redirectUrl = getAppOAuthRedirectUrl(origin);
    const authUrl = provider.authURL + encodeURIComponent(redirectUrl);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth start:', error);
    return NextResponse.json(
      { error: 'Erro ao iniciar login Google' },
      { status: 500 }
    );
  }
}
