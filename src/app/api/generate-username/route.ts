import { NextResponse } from 'next/server';
import PocketBase from 'pocketbase';
import { generateUniqueUsername } from '@/lib/username';

// Gera um username único a partir de um nome, na primeira configuração de
// perfil (Fase 8b) — precisa de autenticar como superuser porque a coleção
// `users` tem list rule restrita (um utilizador normal não consegue
// verificar se um username já está a ser usado), mesmo padrão de
// `/api/friend-lookup` e `/api/notify`.

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top');

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Falta o nome' }, { status: 400 });
    }

    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPass = process.env.POCKETBASE_ADMIN_PASSWORD;
    if (!adminEmail || !adminPass) {
      console.warn('Admin credentials missing. Cannot generate username.');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    try {
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPass);
    } catch (authErr) {
      console.error('PocketBase admin auth failed:', authErr);
      return NextResponse.json({ error: 'PocketBase admin auth failed' }, { status: 500 });
    }

    const username = await generateUniqueUsername(name, async (candidate) => {
      try {
        await pb.collection('users').getFirstListItem(`username = "${candidate}"`);
        return true;
      } catch {
        return false;
      }
    });

    return NextResponse.json({ username });
  } catch (error) {
    console.error('generate-username API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
