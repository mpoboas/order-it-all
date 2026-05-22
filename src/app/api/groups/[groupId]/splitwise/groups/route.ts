import { NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiAuth';
import {
  getGroupSplitwiseByGroupId,
  isSplitwiseConnected,
} from '@/lib/splitwisePb';
import { createSplitwiseClientFromConfig } from '@/lib/splitwiseClient';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    await requireGroupAdmin(request, groupId);
    const config = await getGroupSplitwiseByGroupId(groupId);
    if (!isSplitwiseConnected(config) || !config) {
      return NextResponse.json(
        { error: 'Splitwise não ligado' },
        { status: 400 }
      );
    }

    const sw = createSplitwiseClientFromConfig(config);
    const groups = await sw.groups.list();
    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.members?.length ?? 0,
      })),
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const e = error as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('Splitwise groups list:', error);
    return NextResponse.json(
      { error: 'Erro ao listar grupos Splitwise' },
      { status: 500 }
    );
  }
}
