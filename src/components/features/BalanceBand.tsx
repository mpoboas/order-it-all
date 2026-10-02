'use client';

import { Money } from '@/components/ui/Money';
import { BALANCE_TEXT, balanceTone } from '@/components/ui/Balance';
import { cn } from '@/lib/utils';
import { partyLabel } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import type { BalanceLine } from '@/lib/ledger/balances';
import type { Party } from '@/lib/types';

const MAX_LINES = 3;

interface BalanceBandProps {
  /** Saldo líquido do utilizador no grupo, em cêntimos (positivo = é-lhe devido). */
  netCents: number;
  /** Linhas por pessoa (já simplificadas ou não, consoante o grupo). */
  lines: BalanceLine[];
  parties: Map<string, Party>;
  onSeeAllClick?: () => void;
}

/** Faixa entre a capa do grupo e as ações rápidas (`QuickActions`) — as
 *  dívidas aos pares ("Ana deve-te 12,00 €"), no máximo `MAX_LINES` linhas
 *  compactas + "+N mais" (abre a folha Saldos). Sem o total gigante por
 *  cima (Fase 15): repetia a soma destas mesmas linhas e empurrava a lista de
 *  despesas para metade do ecrã. Alinhada à esquerda, como o título na capa.
 *  Sem borda própria — quem fecha o bloco é o `border-b` das ações. */
export function BalanceBand({
  netCents,
  lines,
  parties,
  onSeeAllClick,
}: BalanceBandProps) {
  const tone = balanceTone(netCents);
  const visibleLines = lines.slice(0, MAX_LINES);
  const overflow = lines.length - visibleLines.length;

  if (visibleLines.length === 0) {
    return (
      <div className="px-4 pt-3 pb-1 bg-surface">
        {tone === 'settled' ? (
          <p className="text-sm text-ink-faint">Contas em dia</p>
        ) : (
          <p className="text-sm text-ink-soft">
            {tone === 'pos' ? 'No total, devem-te ' : 'No total, deves '}
            <Money value={Math.abs(fromCents(netCents))} className={cn('font-semibold', BALANCE_TEXT[tone])} />
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="px-4 pt-3 pb-1 bg-surface space-y-0.5 text-sm text-ink-soft">
      {visibleLines.map((line) => (
        <li key={line.party} className="truncate">
          {line.amountCents > 0 ? (
            <>
              <span className="text-ink">{partyLabel(line.party, parties)}</span> deve-te{' '}
              <Money value={fromCents(line.amountCents)} className="font-semibold text-pos" />
            </>
          ) : (
            <>
              Deves <Money value={fromCents(-line.amountCents)} className="font-semibold text-neg" /> a{' '}
              <span className="text-ink">{partyLabel(line.party, parties)}</span>
            </>
          )}
        </li>
      ))}
      {overflow > 0 && (
        <li>
          <button
            type="button"
            onClick={onSeeAllClick}
            className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            +{overflow} mais
          </button>
        </li>
      )}
    </ul>
  );
}
