'use client';

import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

const EPS = 0.005;

interface BalanceBandProps {
  /** Saldo líquido do utilizador no grupo, em euros (positivo = é-lhe devido). */
  net: number;
  memberCount: number;
  onMembersClick?: () => void;
}

/** Faixa logo abaixo do header do grupo — pastilha de membros + frase de
 *  saldo líquido. Ainda sem "simplificar dívidas" (Fase 3). */
export function BalanceBand({ net, memberCount, onMembersClick }: BalanceBandProps) {
  const settled = Math.abs(net) <= EPS;

  return (
    <div className="px-4 py-3 border-b border-hairline bg-surface flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onMembersClick}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors shrink-0"
      >
        <Icon name="groups" className="text-base" />
        {memberCount} {memberCount === 1 ? 'pessoa' : 'pessoas'}
      </button>

      {settled ? (
        <p className="text-sm font-semibold text-ink-faint">Contas em dia</p>
      ) : (
        <p className={cn('text-sm font-semibold text-right', net > 0 ? 'text-success-fg' : 'text-warning-fg')}>
          {net > 0 ? 'Devem-te ' : 'Deves '}
          <Money value={Math.abs(net)} />
          {net < 0 && ' no total'}
        </p>
      )}
    </div>
  );
}
