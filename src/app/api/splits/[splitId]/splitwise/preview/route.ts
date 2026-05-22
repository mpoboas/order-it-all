import { NextResponse } from 'next/server';
import { requireGroupAdmin, ApiAuthError } from '@/lib/apiAuth';
import {
  getGroupSplitwiseByGroupId,
  getSplitByIdAdmin,
  isSplitwiseConnected,
} from '@/lib/splitwisePb';
import {
  calculateExportGrandTotal,
  calculateSplitTotals,
} from '@/lib/splitShare';
import { buildDefaultParticipantMap } from '@/lib/splitwiseMapping';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ splitId: string }> }
) {
  try {
    const { splitId } = await params;
    const split = await getSplitByIdAdmin(splitId);
    await requireGroupAdmin(request, split.group_id);

    const config = await getGroupSplitwiseByGroupId(split.group_id);
    const members = config?.members_cache ?? [];
    const suggestedMap =
      split.splitwise_participant_map ??
      buildDefaultParticipantMap(
        split.participants,
        members,
        config?.name_map
      );

    return NextResponse.json({
      connected: isSplitwiseConnected(config),
      splitwiseGroupId: config?.splitwise_group_id,
      splitwiseGroupName: config?.splitwise_group_name,
      members,
      totals: calculateSplitTotals(split),
      grandTotal: calculateExportGrandTotal(split.items),
      suggestedMap,
      exported: Boolean(split.splitwise_expense_id),
      expenseId: split.splitwise_expense_id,
    });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
