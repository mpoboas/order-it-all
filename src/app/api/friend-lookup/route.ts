import { NextResponse } from 'next/server';
import PocketBase from 'pocketbase';

// Procura um utilizador por email para o fluxo "Adicionar amigo" (Fase 8).
// A coleção `users` tem list rule restrita — um utilizador normal não
// consegue `getFirstListItem('email = "...")`, por isso isto autentica como
// superuser (mesmo padrão de `src/app/api/notify/route.ts`) e devolve só o
// mínimo necessário, nunca a regra da coleção `users` em si.

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top');

interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  email: string;
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Falta o email' }, { status: 400 });
    }

    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPass = process.env.POCKETBASE_ADMIN_PASSWORD;
    if (!adminEmail || !adminPass) {
      console.warn('Admin credentials missing. Cannot look up users by email.');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    try {
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
    } catch (authErr) {
      console.error('PocketBase admin auth failed:', authErr);
      return NextResponse.json({ error: 'PocketBase admin auth failed' }, { status: 500 });
    }

    try {
      const user = await pb.collection('users').getFirstListItem<PublicUser>(
        `email = "${email.trim().toLowerCase().replace(/"/g, '\\"')}"`,
      );
      return NextResponse.json({ user: { id: user.id, name: user.name, avatar: user.avatar } });
    } catch {
      return NextResponse.json({ user: null });
    }
  } catch (error) {
    console.error('friend-lookup API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
