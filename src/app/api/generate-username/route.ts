import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { requireUserId, unauthorized } from '@/lib/serverAuth';
import { generateUniqueUsername } from '@/lib/username';

// Gera um username único a partir de um nome, na primeira configuração de
// perfil (Fase 8b) — corre como superuser porque a coleção `users` tem list
// rule restrita (um utilizador normal não consegue verificar se um username
// já está a ser usado). Exige sessão (o perfil já existe nesse passo).

export async function POST(request: Request) {
  try {
    const callerId = await requireUserId(request);
    if (!callerId) return unauthorized();

    const { name } = await request.json();
    if (!name || typeof name !== 'string' || name.length > 200) {
      return NextResponse.json({ error: 'Falta o nome' }, { status: 400 });
    }

    const pb = await getAdminPb();
    const username = await generateUniqueUsername(name, async (candidate) => {
      try {
        await pb.collection('users').getFirstListItem(pb.filter('username = {:u}', { u: candidate }));
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
