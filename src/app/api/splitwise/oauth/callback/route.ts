import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Splitwise } from 'splitwise';
import { upsertGroupSplitwise } from '@/lib/splitwisePb';
import {
  getSplitwiseCredentials,
  getSplitwiseRedirectUri,
} from '@/lib/splitwiseClient';

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export async function GET(request: Request) {
  const base = appBaseUrl();
  const fail = (msg: string) =>
    NextResponse.redirect(
      `${base}/groups?splitwise_error=${encodeURIComponent(msg)}`
    );

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    const cookieStore = await cookies();
    const savedState = cookieStore.get('sw_oauth_state')?.value;
    const codeVerifier = cookieStore.get('sw_oauth_verifier')?.value;
    const groupId = cookieStore.get('sw_oauth_group_id')?.value;

    cookieStore.delete('sw_oauth_state');
    cookieStore.delete('sw_oauth_verifier');
    cookieStore.delete('sw_oauth_group_id');

    if (!code || !state || !codeVerifier || !groupId) {
      return fail('OAuth incompleto');
    }
    if (state !== savedState) {
      return fail('Estado OAuth inválido');
    }

    const { consumerKey, consumerSecret } = getSplitwiseCredentials();
    const redirectUri = getSplitwiseRedirectUri();

    const sw = await Splitwise.fromAuthorizationCode({
      clientId: consumerKey,
      clientSecret: consumerSecret,
      code,
      codeVerifier,
      redirectUri,
    });

    const me = await sw.users.getCurrent();
    const accessToken = await sw.getAccessToken();

    await upsertGroupSplitwise(groupId, {
      access_token: accessToken,
      connected_user_id: me.id,
    });

    return NextResponse.redirect(
      `${base}/groups/${groupId}/admin?tab=settings&splitwise=connected`
    );
  } catch (error) {
    console.error('Splitwise OAuth callback:', error);
    const message =
      error instanceof Error ? error.message : 'Erro ao ligar Splitwise';
    return fail(message);
  }
}
