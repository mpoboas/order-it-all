import { NextResponse } from 'next/server';
import PocketBase from 'pocketbase';

// Procura um utilizador por email OU username (Fase 8/8b) para o fluxo
// "Adicionar amigo" — um único campo, decide sozinho pelo "@". A coleção
// `users` tem list rule restrita — um utilizador normal não consegue
// `getFirstListItem('email = "...")`, por isso isto autentica como
// superuser (mesmo padrão de `src/app/api/notify/route.ts`) e devolve só o
// mínimo necessário, nunca a regra da coleção `users` em si.

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top');

interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  username?: string;
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Falta o email ou username' }, { status: 400 });
    }
    const trimmed = query.trim();
    // "@username" é a forma natural de escrever um username — só conta como
    // email se tiver algo antes E depois do "@" (nome@domínio).
    const isEmail = /^[^@]+@[^@]+$/.test(trimmed);
    const forFilter = isEmail ? trimmed : trimmed.replace(/^@/, '');
    const escaped = forFilter.toLowerCase().replace(/"/g, '\\"');
    const filter = isEmail ? `email = "${escaped}"` : `username = "${escaped}"`;

    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPass = process.env.POCKETBASE_ADMIN_PASSWORD;
    if (!adminEmail || !adminPass) {
      console.warn('Admin credentials missing. Cannot look up users.');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    try {
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
    } catch (authErr) {
      console.error('PocketBase admin auth failed:', authErr);
      return NextResponse.json({ error: 'PocketBase admin auth failed' }, { status: 500 });
    }

    try {
      const user = await pb.collection('users').getFirstListItem<PublicUser>(filter);
      return NextResponse.json({ user: { id: user.id, name: user.name, avatar: user.avatar, username: user.username } });
    } catch {
      return NextResponse.json({ user: null });
    }
  } catch (error) {
    console.error('friend-lookup API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
