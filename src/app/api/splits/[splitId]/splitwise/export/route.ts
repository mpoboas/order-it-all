import { NextResponse } from 'next/server';
import { requireGroupAdmin, ApiAuthError } from '@/lib/apiAuth';
import {
  getGroupSplitwiseByGroupId,
  getSplitByIdAdmin,
  upsertGroupSplitwise,
  updateSplitAdmin,
  isSplitwiseConnected,
} from '@/lib/splitwisePb';
import { exportSplitToSplitwise } from '@/lib/splitwiseExport';
import { closeSplitPayload } from '@/lib/splitStatus';

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ splitId: string }> }
) {
  try {
    const { splitId } = await params;
    const body = await request.json();

    const participantMap = body.participantMap as Record<string, number> | undefined;
    const payerParticipantName =
      typeof body.payerParticipantName === 'string'
        ? body.payerParticipantName.trim()
        : '';
    const force = body.force === true;
    const saveNameMap = body.saveNameMap !== false;

    if (!participantMap || !payerParticipantName) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const split = await getSplitByIdAdmin(splitId);
    await requireGroupAdmin(request, split.group_id);

    const config = await getGroupSplitwiseByGroupId(split.group_id);
    if (!isSplitwiseConnected(config) || !config?.splitwise_group_id) {
      return NextResponse.json(
        { error: 'Splitwise não ligado neste grupo' },
        { status: 400 }
      );
    }

    if (split.splitwise_expense_id && !force) {
      return NextResponse.json(
        {
          error: 'already_exported',
          expenseId: split.splitwise_expense_id,
        },
        { status: 409 }
      );
    }

    const base = appBaseUrl();
    const result = await exportSplitToSplitwise({
      config,
      split,
      participantMap,
      payerParticipantName,
      appUrl: base,
    });

    const now = new Date().toISOString();
    await updateSplitAdmin(splitId, {
      splitwise_participant_map: participantMap,
      splitwise_expense_id: result.expenseId,
      splitwise_exported_at: now,
      ...closeSplitPayload(),
    });

    if (saveNameMap) {
      await upsertGroupSplitwise(split.group_id, {
        name_map: {
          ...(config.name_map ?? {}),
          ...participantMap,
        },
      });
    }

    return NextResponse.json({
      expenseId: result.expenseId,
      cost: result.cost,
      url: `https://secure.splitwise.com/expenses/${result.expenseId}`,
    });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Splitwise export:', error);
    const message =
      error instanceof Error ? error.message : 'Erro ao exportar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
