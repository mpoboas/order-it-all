import { NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiAuth';
import {
  getGroupSplitwiseByGroupId,
  upsertGroupSplitwise,
  deleteGroupSplitwiseByGroupId,
  isSplitwiseConnected,
} from '@/lib/splitwisePb';
import { createSplitwiseClientFromConfig } from '@/lib/splitwiseClient';
import { splitwiseMembersFromGroup } from '@/lib/splitwiseMembers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    await requireGroupAdmin(request, groupId);
    const body = await request.json();
    const splitwiseGroupId = Number(body.splitwiseGroupId);

    if (!Number.isInteger(splitwiseGroupId) || splitwiseGroupId <= 0) {
      return NextResponse.json({ error: 'Grupo inválido' }, { status: 400 });
    }

    const config = await getGroupSplitwiseByGroupId(groupId);
    if (!isSplitwiseConnected(config) || !config) {
      return NextResponse.json(
        { error: 'Splitwise não ligado' },
        { status: 400 }
      );
    }

    const sw = createSplitwiseClientFromConfig(config);
    const swGroup = await sw.groups.get({ id: splitwiseGroupId });
    const members = splitwiseMembersFromGroup(swGroup.members);

    const updated = await upsertGroupSplitwise(groupId, {
      splitwise_group_id: splitwiseGroupId,
      splitwise_group_name: swGroup.name ?? '',
      members_cache: members,
    });

    return NextResponse.json({
      splitwiseGroupId: updated.splitwise_group_id,
      splitwiseGroupName: updated.splitwise_group_name,
      members,
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const e = error as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Splitwise configure:', error);
    return NextResponse.json({ error: 'Erro ao configurar' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    await requireGroupAdmin(request, groupId);
    await deleteGroupSplitwiseByGroupId(groupId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const e = error as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
