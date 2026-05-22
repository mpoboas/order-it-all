import { NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/apiAuth';
import {
  getGroupSplitwiseByGroupId,
  isSplitwiseConnected,
  toPublicSplitwiseConfig,
} from '@/lib/splitwisePb';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params;
    await requireGroupAdmin(request, groupId);
    const config = await getGroupSplitwiseByGroupId(groupId);
    return NextResponse.json({
      connected: isSplitwiseConnected(config),
      splitwise: toPublicSplitwiseConfig(config),
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const e = error as { status: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
