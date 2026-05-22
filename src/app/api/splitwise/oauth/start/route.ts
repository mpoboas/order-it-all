import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Splitwise } from 'splitwise';
import { requireGroupAdmin } from '@/lib/apiAuth';
import {
  getSplitwiseCredentials,
  getSplitwiseRedirectUri,
} from '@/lib/splitwiseClient';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 600,
  path: '/',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }

    await requireGroupAdmin(request, groupId);

    const { consumerKey } = getSplitwiseCredentials();
    const redirectUri = getSplitwiseRedirectUri();

    const auth = await Splitwise.createAuthorizationUrl({
      clientId: consumerKey,
      redirectUri,
    });

    const cookieStore = await cookies();
    cookieStore.set('sw_oauth_state', auth.state, COOKIE_OPTS);
    cookieStore.set('sw_oauth_verifier', auth.codeVerifier, COOKIE_OPTS);
    cookieStore.set('sw_oauth_group_id', groupId, COOKIE_OPTS);

    const wantsJson = searchParams.get('format') === 'json';
    if (wantsJson) {
      return NextResponse.json({ url: auth.url });
    }

    return NextResponse.redirect(auth.url);
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const e = error as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Splitwise OAuth start:', error);
    return NextResponse.json(
      { error: 'Splitwise não configurado ou erro ao iniciar OAuth' },
      { status: 500 }
    );
  }
}
