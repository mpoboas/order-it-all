import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
import type { OAuthMeta } from '@/lib/googleAuth';
import {
  getAppOAuthRedirectUrl,
  getPocketBaseUrl,
  GOOGLE_OAUTH_COOKIES,
  GOOGLE_OAUTH_PROVIDER,
} from '@/lib/googleOAuthShared';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; state?: string };
    const code = body.code?.trim();
    const state = body.state?.trim();

    if (!code || !state) {
      return NextResponse.json({ error: 'OAuth incompleto' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get(GOOGLE_OAUTH_COOKIES.state)?.value;
    const codeVerifier = cookieStore.get(GOOGLE_OAUTH_COOKIES.codeVerifier)?.value;
    const redirectPath =
      cookieStore.get(GOOGLE_OAUTH_COOKIES.redirect)?.value ?? null;

    cookieStore.delete(GOOGLE_OAUTH_COOKIES.state);
    cookieStore.delete(GOOGLE_OAUTH_COOKIES.codeVerifier);
    cookieStore.delete(GOOGLE_OAUTH_COOKIES.redirect);

    if (!savedState || !codeVerifier) {
      return NextResponse.json(
        { error: 'Sessão OAuth expirada. Tenta iniciar sessão outra vez.' },
        { status: 400 }
      );
    }

    if (state !== savedState) {
      return NextResponse.json({ error: 'Estado OAuth inválido' }, { status: 400 });
    }

    const { origin } = new URL(request.url);
    const redirectUrl = getAppOAuthRedirectUrl(origin);

    const pb = new PocketBase(getPocketBaseUrl());
    const authData = await pb.collection('users').authWithOAuth2Code(
      GOOGLE_OAUTH_PROVIDER,
      code,
      codeVerifier,
      redirectUrl
    );

    const record = authData.record as Record<string, unknown>;
    const meta = (authData.meta ?? {}) as OAuthMeta;

    return NextResponse.json({
      token: authData.token,
      record,
      meta,
      redirectPath,
    });
  } catch (error) {
    console.error('Google OAuth complete:', error);
    const message =
      error instanceof Error ? error.message : 'Erro ao entrar com Google';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
