'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { partyAvatarUrl, partyLabel } from '@/lib/parties';
import { formatEUR } from '@/lib/money';
import type { Expense, Party } from '@/lib/types';

interface ShareTreeProps {
  expense: Expense;
  parties: Map<string, Party>;
  myId?: string;
}

/** Árvore de partes no detalhe de uma despesa — raiz com quem pagou, ramos
 *  com quanto cada um deve (ou pagou + deve, se também participa). À
 *  Splitwise: "Tu pagaste 22,26 € e deves 21,31 €", "João C. deve 24,90 €". */
export function ShareTree({ expense, parties, myId }: ShareTreeProps) {
  if (expense.payers.length === 0) {
    return <p className="text-sm text-warning-fg font-medium">Falta definir quem pagou.</p>;
  }

  const label = (id: string) => (id === myId ? 'Tu' : partyLabel(id, parties));

  const rootLine =
    expense.payers.length === 1
      ? `${label(expense.payers[0].party)} pagou`
      : `${expense.payers.length} pessoas pagaram`;

  // Todas as partes envolvidas (pagador e/ou devedor), sem duplicar.
  const involved = new Map<string, { paid: number; owed: number }>();
  for (const p of expense.payers) {
    involved.set(p.party, { paid: p.amount, owed: 0 });
  }
  for (const s of expense.shares) {
    const existing = involved.get(s.party);
    if (existing) existing.owed = s.amount;
    else involved.set(s.party, { paid: 0, owed: s.amount });
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <Avatar name={label(expense.payers[0].party)} src={partyAvatarUrl(expense.payers[0].party, parties)} size="sm" />
        <p className="font-semibold text-ink">
          {rootLine} <Money value={expense.amount} className="text-primary-600 dark:text-primary-400" />
        </p>
      </div>
      <ul className="ml-4 border-l border-hairline pl-4 space-y-2 mt-2">
        {Array.from(involved.entries()).map(([id, { paid, owed }]) => (
          <li key={id} className="flex items-center gap-2.5">
            <Avatar name={label(id)} src={partyAvatarUrl(id, parties)} size="xs" />
            <p className="text-sm text-ink">
              {label(id)}{' '}
              {paid > 0 && owed > 0 ? (
                <>pagou {formatEUR(paid)} e deve {formatEUR(owed)}</>
              ) : owed > 0 ? (
                <>deve {formatEUR(owed)}</>
              ) : (
                <>não deve nada</>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
