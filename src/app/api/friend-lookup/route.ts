import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { requireUserId, unauthorized } from '@/lib/serverAuth';

// Procura um utilizador por email OU username (Fase 8/8b) para o fluxo
// "Adicionar amigo" — um único campo, decide sozinho pelo "@". A coleção
// `users` tem list rule restrita — um utilizador normal não consegue
// `getFirstListItem('email = "...")`, por isso isto corre como superuser e
// devolve só o mínimo necessário. Exige sessão: sem isto era um oráculo
// público de "este email tem conta?".

interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  username?: string;
}

export async function POST(request: Request) {
  try {
    const callerId = await requireUserId(request);
    if (!callerId) return unauthorized();

    const { query } = await request.json();
    if (!query || typeof query !== 'string' || !query.trim() || query.length > 254) {
      return NextResponse.json({ error: 'Falta o email ou username' }, { status: 400 });
    }
    const trimmed = query.trim();
    // "@username" é a forma natural de escrever um username — só conta como
    // email se tiver algo antes E depois do "@" (nome@domínio).
    const isEmail = /^[^@]+@[^@]+$/.test(trimmed);
    const value = (isEmail ? trimmed : trimmed.replace(/^@/, '')).toLowerCase();

    const pb = await getAdminPb();
    try {
      const user = await pb.collection('users').getFirstListItem<PublicUser>(
        pb.filter(isEmail ? 'email = {:v}' : 'username = {:v}', { v: value }),
      );
      return NextResponse.json({ user: { id: user.id, name: user.name, avatar: user.avatar, username: user.username } });
    } catch {
      return NextResponse.json({ user: null });
    }
  } catch (error) {
    console.error('friend-lookup API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
