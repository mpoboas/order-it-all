import { NextResponse } from 'next/server';
import { getAdminPb } from '@/lib/pbAdmin';
import { PB_ID_RE, requireUserId, unauthorized } from '@/lib/serverAuth';
import { userRemovalBlock } from '@/lib/memberGuards';
import type { Expense, Group, Order, Placeholder, Trip } from '@/lib/types';

// Sair do grupo / remover um membro (Definições do grupo). Passa pelo servidor por
// duas razões:
//  - as regras do PB só deixam ADMINS editar `groups` — um membro normal não
//    conseguia sair sozinho;
//  - a proteção "só com as contas fechadas" (saldo exatamente zero, sem
//    pedidos em viagens abertas) é imposta aqui, não só no ecrã — ver
//    `src/lib/memberGuards.ts`, a mesma regra que o ecrã usa para explicar.
// Permissões: qualquer membro pode sair (menos o dono — esse elimina o
// grupo); um admin remove membros normais; só o dono remove admins.

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string; userId: string }> },
) {
  try {
    const requesterId = await requireUserId(request);
    if (!requesterId) return unauthorized();

    const { groupId, userId: targetId } = await params;
    if (!PB_ID_RE.test(groupId) || !PB_ID_RE.test(targetId)) {
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
    }

    const pb = await getAdminPb();
    const group = await pb.collection('groups').getOne<Group>(groupId).catch(() => null);
    if (!group || !group.members.includes(requesterId)) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }
    if (!group.members.includes(targetId)) {
      return NextResponse.json({ error: 'Esta pessoa já não está no grupo' }, { status: 404 });
    }
    if (targetId === group.creator) {
      return NextResponse.json({ error: 'O dono não pode sair do grupo. Pode eliminá-lo nas definições.' }, { status: 403 });
    }
    const self = requesterId === targetId;
    if (!self) {
      const requesterIsAdmin = group.admins.includes(requesterId);
      const targetIsAdmin = group.admins.includes(targetId);
      if (!requesterIsAdmin || (targetIsAdmin && requesterId !== group.creator)) {
        return NextResponse.json({ error: 'Sem permissão para remover esta pessoa' }, { status: 403 });
      }
    }

    const byGroup = pb.filter('group_id = {:g}', { g: groupId });
    const [expenses, placeholders, trips, orders] = await Promise.all([
      pb.collection('expenses').getFullList<Expense>({ filter: byGroup }),
      pb.collection('placeholders').getFullList<Placeholder>({ filter: byGroup, fields: 'id,claimed_by' }),
      pb.collection('trips').getFullList<Trip>({ filter: byGroup, fields: 'id,status' }),
      pb.collection('orders').getFullList<Order>({
        filter: pb.filter('trip_id.group_id = {:g} && user = {:u}', { g: groupId, u: targetId }),
        fields: 'trip_id,user',
      }),
    ]);

    const block = userRemovalBlock({ userId: targetId, expenses, placeholders, trips, orders });
    if (block) {
      return NextResponse.json({ error: 'Contas por fechar', block }, { status: 409 });
    }

    await pb.collection('groups').update(groupId, { 'members-': targetId, 'admins-': targetId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
