'use client';

import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/utils';
import { partyLabel } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import type { BalanceLine } from '@/lib/ledger/balances';
import type { Party } from '@/lib/types';

const EPS = 0.005;
const MAX_LINES = 3;

interface BalanceBandProps {
  /** Saldo líquido do utilizador no grupo, em cêntimos (positivo = é-lhe devido). */
  netCents: number;
  /** Linhas por pessoa (já simplificadas ou não, consoante o grupo). */
  lines: BalanceLine[];
  parties: Map<string, Party>;
  onSeeAllClick?: () => void;
}

/** Faixa entre o nome do grupo (hero) e a fila de ações (`ActionChipRow`) —
 *  saldo líquido + até 3 linhas por pessoa, centrada (ocupa o lugar do
 *  antigo botão "Saldos" isolado). Sem borda própria — quem fecha esse
 *  bloco (hero → esta faixa → `ActionChipRow` → tabs) é o `border-b` do
 *  `ActionChipRow`, por baixo. */
export function BalanceBand({
  netCents,
  lines,
  parties,
  onSeeAllClick,
}: BalanceBandProps) {
  const net = fromCents(netCents);
  const settled = Math.abs(net) <= EPS;
  const visibleLines = lines.slice(0, MAX_LINES);
  const overflow = lines.length - visibleLines.length;

  return (
    <div className="px-4 py-3 bg-surface space-y-2 text-center">
      {settled ? (
        <p className="text-sm font-semibold text-ink-faint">Contas em dia</p>
      ) : (
        <p className={cn('text-sm font-semibold', net > 0 ? 'text-success-fg' : 'text-warning-fg')}>
          {net > 0 ? 'Devem-te ' : 'Deves '}
          <Money value={Math.abs(net)} />
          {net < 0 && ' no total'}
        </p>
      )}

      {visibleLines.length > 0 && (
        <ul className="space-y-0.5">
          {visibleLines.map((line) => (
            <li key={line.party} className="text-xs text-ink-soft">
              {line.amountCents > 0 ? (
                <>
                  <span className="font-medium text-ink">{partyLabel(line.party, parties)}</span> deve-te{' '}
                  <span className="font-semibold text-success-fg">{formatEUR(fromCents(line.amountCents))}</span>
                </>
              ) : (
                <>
                  Deves{' '}
                  <span className="font-semibold text-warning-fg">{formatEUR(fromCents(-line.amountCents))}</span> a{' '}
                  <span className="font-medium text-ink">{partyLabel(line.party, parties)}</span>
                </>
              )}
            </li>
          ))}
          {overflow > 0 && (
            <li>
              <button
                type="button"
                onClick={onSeeAllClick}
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                +{overflow} mais
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
