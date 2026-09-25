'use client';

import { useState } from 'react';
import type { BalanceLine } from '@/lib/ledger/balances';
import { fromCents } from '@/lib/ledger/money';
import { partyLabel, isUnclaimedPlaceholder } from '@/lib/parties';
import type { Party } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

const SETTLED_CENTS = 0;

/**
 * Saldo LÍQUIDO de uma pessoa no grupo (o que pagou menos a sua parte), com
 * sinal: "+14,35 €" / "−8,70 €". Deliberadamente sem verbos — "deve"/"deve-te"
 * ficam reservados às dívidas entre duas pessoas (cabeçalho do grupo, linhas
 * expandidas), que são outro número. Usar os mesmos verbos para as duas coisas
 * fazia "Bruno deve-te 10,24 €" e "Bruno DEVE 8,70 €" parecerem contraditórios.
 */
export function GroupNetBalance({ netCents, className }: { netCents: number; className?: string }) {
  const settled = Math.abs(netCents) <= SETTLED_CENTS;
  const tone = settled ? 'text-ink-faint' : netCents > 0 ? 'text-success-fg' : 'text-warning-fg';
  const sign = netCents > 0 ? '+' : '−';
  return (
    <div className={cn('text-right shrink-0', className)}>
      <p className="text-[10px] font-bold uppercase text-ink-faint">Saldo no grupo</p>
      {settled ? (
        <p className="text-sm font-semibold text-ink-faint">em dia</p>
      ) : (
        <p className={cn('text-sm font-bold tabular-nums', tone)}>
          <span aria-hidden="true">{sign}</span>
          <span className="sr-only">{netCents > 0 ? 'a receber ' : 'a pagar '}</span>
          <Money value={Math.abs(fromCents(netCents))} />
        </p>
      )}
    </div>
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
  onRemind: (debtorPartyId: string, amountCents: number) => void;
}

/**
 * Lista de saldos do grupo (folha "Saldos" e página `/groups/[id]/balances`):
 * cada pessoa com o seu saldo no grupo; expandir mostra as dívidas aos pares,
 * que são os mesmos números do cabeçalho do grupo. Na linha de quem está a ver,
 * os pares ficam na 2.ª pessoa ("Bruno deve-te 10,24 €"), iguais ao cabeçalho.
 */
export function BalanceRows({ rows, parties, currentUserId, onRemind }: BalanceRowsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      <p className="text-xs text-ink-faint mb-2 px-1">
        Saldo no grupo = o que cada pessoa pagou menos a sua parte. Toca numa pessoa para ver quem deve a quem.
      </p>
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
                    <Badge variant="neutral" className="mt-0.5">Sem conta</Badge>
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
                            <span className="font-medium text-ink">{partyLabel(line.party, parties)}</span>{' '}
                            {isMe ? 'deve-te' : 'deve-lhe'}{' '}
                            <span className="font-semibold text-success-fg">
                              <Money value={fromCents(line.amountCents)} />
                            </span>
                          </>
                        ) : (
                          <>
                            {isMe ? 'Deves' : 'Deve'}{' '}
                            <span className="font-semibold text-warning-fg">
                              <Money value={fromCents(-line.amountCents)} />
                            </span>{' '}
                            a <span className="font-medium text-ink">{partyLabel(line.party, parties)}</span>
                          </>
                        )}
                      </p>
                      {isMe && line.amountCents > 0 && (
                        <button
                          type="button"
                          onClick={() => onRemind(line.party, line.amountCents)}
                          className="shrink-0 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          Lembrar
                        </button>
                      )}
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
