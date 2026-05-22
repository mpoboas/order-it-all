import type { UserShare } from 'splitwise';
import type { GroupSplitwise, Split } from '@/lib/types';
import {
  calculateExportGrandTotal,
  calculateSplitTotals,
} from '@/lib/splitShare';
import { createSplitwiseClientFromConfig } from '@/lib/splitwiseClient';

export function formatMoney(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/** Distribute owed amounts in cents so sum equals grandTotalCents */
export function allocateOwedCents(
  totals: Record<string, number>,
  grandTotalCents: number,
  participantOrder: string[]
): Record<string, number> {
  const owed: Record<string, number> = {};
  let assigned = 0;
  const withDebt = participantOrder.filter((p) => (totals[p] ?? 0) > 0.001);

  for (let i = 0; i < withDebt.length; i++) {
    const name = withDebt[i];
    const isLast = i === withDebt.length - 1;
    if (isLast) {
      owed[name] = grandTotalCents - assigned;
    } else {
      const cents = Math.round((totals[name] ?? 0) * 100);
      owed[name] = cents;
      assigned += cents;
    }
  }

  for (const name of participantOrder) {
    if (owed[name] === undefined) owed[name] = 0;
  }

  return owed;
}

export interface ExportToSplitwiseParams {
  config: GroupSplitwise;
  split: Split;
  participantMap: Record<string, number>;
  payerParticipantName: string;
  appUrl?: string;
}

export interface ExportToSplitwiseResult {
  expenseId: number;
  cost: string;
}

export async function exportSplitToSplitwise(
  params: ExportToSplitwiseParams
): Promise<ExportToSplitwiseResult> {
  const { config, split, participantMap, payerParticipantName, appUrl } =
    params;

  if (!config.splitwise_group_id) {
    throw new Error('Grupo Splitwise não configurado');
  }

  const sw = createSplitwiseClientFromConfig(config);
  const totals = calculateSplitTotals(split);
  const grandTotal = calculateExportGrandTotal(split.items);
  const grandTotalCents = Math.round(grandTotal * 100);

  if (grandTotalCents <= 0) {
    throw new Error('Não há itens com participantes para exportar');
  }

  const payerSwId = participantMap[payerParticipantName];
  if (!payerSwId) {
    throw new Error('Pagador não mapeado para Splitwise');
  }

  for (const name of split.participants) {
    if (!participantMap[name]) {
      throw new Error(`Participante "${name}" não mapeado`);
    }
  }

  const owedCents = allocateOwedCents(
    totals,
    grandTotalCents,
    split.participants
  );

  const users: UserShare[] = split.participants.map((name) => {
    const userId = participantMap[name];
    const isPayer = name === payerParticipantName;
    return {
      userId,
      paidShare: isPayer ? formatMoney(grandTotal) : '0.00',
      owedShare: formatMoney((owedCents[name] ?? 0) / 100),
    };
  });

  const currencyCode = 'EUR';

  const details = appUrl
    ? `Importado de Order It All: ${appUrl}/groups/${split.group_id}/splits/${split.id}`
    : `Importado de Order It All — ${split.name}`;

  const expense = await sw.expenses.create({
    cost: formatMoney(grandTotal),
    description: split.name.slice(0, 200) || 'Divisão',
    details,
    groupId: config.splitwise_group_id,
    currencyCode,
    users,
  });

  if (!expense.id) {
    throw new Error('Splitwise não devolveu ID da despesa');
  }

  return { expenseId: expense.id, cost: formatMoney(grandTotal) };
}
