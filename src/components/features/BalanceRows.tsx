'use client';

import { useState } from 'react';
import type { BalanceLine } from '@/lib/ledger/balances';
import { fromCents } from '@/lib/ledger/money';
import { partyLabel, isUnclaimedPlaceholder } from '@/lib/parties';
import type { Party } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { BALANCE_TEXT, balanceTone } from '@/components/ui/Balance';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * Saldo LÍQUIDO de uma pessoa no grupo (o que pagou menos a sua parte), com
 * sinal: "+14,35 €" / "−8,70 €". Deliberadamente sem verbos — "deve"/"deve-te"
 * ficam reservados às dívidas entre duas pessoas (cabeçalho do grupo, linhas
 * expandidas), que são outro número. Usar os mesmos verbos para as duas coisas
 * fazia "Bruno deve-te 10,24 €" e "Bruno DEVE 8,70 €" parecerem contraditórios.
 * Sem etiqueta "Saldo no grupo" por linha (Fase 15): repetida 10× numa lista
 * gritava mais do que os números — o que o número é explica-se uma vez, no
 * topo da lista.
 */
export function GroupNetBalance({
  netCents,
  inline = false,
  className,
}: {
  netCents: number;
  /** Por baixo do nome (linha secundária), em vez de coluna à direita. */
  inline?: boolean;
  className?: string;
}) {
  const tone = balanceTone(netCents);
  const layout = inline ? 'text-sm' : 'text-base text-right shrink-0';
  if (tone === 'settled') {
    return <p className={cn(layout, 'text-ink-faint', className)}>em dia</p>;
  }
  return (
    <p className={cn(layout, 'font-semibold tracking-tight tabular-nums', BALANCE_TEXT[tone], className)}>
      <span aria-hidden="true">{tone === 'pos' ? '+' : '−'}</span>
      <span className="sr-only">{tone === 'pos' ? 'a receber ' : 'a pagar '}</span>
      <Money value={Math.abs(fromCents(netCents))} />
    </p>
  );
}

export interface BalanceRow {
  id: string;
  netCents: number;
  lines: BalanceLine[];
}

interface BalanceRowsProps {
  rows: BalanceRow[];
  parties: Map<string, Party>;
  currentUserId?: string;
}

/**
 * Lista de saldos do grupo (folha "Saldos" e página `/groups/[id]/balances`):
 * cada pessoa com o seu saldo no grupo; expandir mostra as dívidas aos pares,
 * que são os mesmos números do cabeçalho do grupo. Nas linhas expandidas o
 * verbo é só "deve" ("Bruno deve 10,24 €") — o credor é a pessoa da linha.
 */
export function BalanceRows({ rows, parties, currentUserId }: BalanceRowsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      <div className="card divide-y divide-hairline overflow-hidden">
        {rows.map((row) => {
          const party = parties.get(row.id);
          if (!party) return null;
          const expanded = expandedId === row.id;
          const isMe = row.id === currentUserId;
          const canExpand = row.lines.length > 0;
          return (
            <div key={row.id}>
              <button
                type="button"
                onClick={() => canExpand && setExpandedId(expanded ? null : row.id)}
                aria-expanded={canExpand ? expanded : undefined}
                aria-controls={canExpand ? `balance-lines-${row.id}` : undefined}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
              >
                <Avatar name={party.name} src={party.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{party.name}</p>
                  {isUnclaimedPlaceholder(row.id, parties) && (
                    <p className="text-xs text-ink-faint">Sem conta</p>
                  )}
                </div>
                <GroupNetBalance netCents={row.netCents} />
                {canExpand && (
                  <Icon
                    name="keyboard_arrow_down"
                    aria-hidden="true"
                    className={cn('text-ink-faint transition-transform', expanded && 'rotate-180')}
                  />
                )}
              </button>
              {expanded && canExpand && (
                <div id={`balance-lines-${row.id}`} className="px-4 pb-3 pl-14 space-y-1.5">
                  {row.lines.map((line) => (
                    <div key={line.party} className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink-soft">
                        {line.amountCents > 0 ? (
                          <>
                            <span className="font-medium text-ink">{partyLabel(line.party, parties)}</span> deve{' '}
                            <span className="font-semibold text-pos">
                              <Money value={fromCents(line.amountCents)} />
                            </span>
                          </>
                        ) : (
                          <>
                            {isMe ? 'Deves' : 'Deve'}{' '}
                            <span className="font-semibold text-neg">
                              <Money value={fromCents(-line.amountCents)} />
                            </span>{' '}
                            a <span className="font-medium text-ink">{partyLabel(line.party, parties)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
