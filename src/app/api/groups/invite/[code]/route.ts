import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { requireUserId, unauthorized } from '@/lib/serverAuth';
import type { Group, InvitePreview } from '@/lib/types';

// Convites de grupo. Quem ainda não é membro não tem acesso a `groups` (regras
// em `pb/migrations/5_lock_legacy.js`), por isso validar o código e entrar no
// grupo passa por aqui, como super-utilizador:
//   GET  → pré-visualização mínima (nome, avatar, quem convidou, nº membros)
//   POST → entra no grupo (exige sessão; acrescenta com `members+`, atómico)
// O código é a credencial: nunca devolver `invite_code`, `members` ou `admins`.

const INVITE_CODE_RE = /^[A-Za-z0-9]{6,16}$/;

async function findGroupByInvite(code: string): Promise<Group | null> {
  const pb = await getAdminPb();
  try {
    return await pb.collection('groups').getFirstListItem<Group>(
      pb.filter('invite_code = {:code} && invite_active = true', { code }),
      { expand: 'creator' },
    );
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!INVITE_CODE_RE.test(code)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const group = await findGroupByInvite(code);
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Sessão é opcional aqui — só serve para dizer "já és membro".
    const userId = request.headers.get('authorization') ? await requireUserId(request) : null;

    const preview: InvitePreview = {
      groupId: group.id,
      name: group.name,
      avatar: group.avatar,
      creatorName: group.expand?.creator?.name || null,
      memberCount: group.members.length,
      isMember: !!userId && group.members.includes(userId),
    };
    return NextResponse.json(preview);
  } catch (error) {
    console.error('Invite preview error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();

    const { code } = await params;
    if (!INVITE_CODE_RE.test(code)) return NextResponse.json({ error: 'Convite inválido' }, { status: 404 });

    const group = await findGroupByInvite(code);
    if (!group) return NextResponse.json({ error: 'Convite inválido ou expirado' }, { status: 404 });

    if (!group.members.includes(userId)) {
      const pb = await getAdminPb();
      await pb.collection('groups').update(group.id, { 'members+': userId });
    }
    return NextResponse.json({ groupId: group.id });
  } catch (error) {
    console.error('Invite join error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
