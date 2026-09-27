'use client';

import { useUser } from '@/context/UserContext';
import { useBalanceOverview } from '@/lib/db/hooks';
import { fromCents } from '@/lib/ledger/money';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { BALANCE_TEXT } from '@/components/ui/Balance';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/** Topo do Início — avatar + saudação, seguido de dois mosaicos lado a lado:
 *  quanto te devem (a receber) e quanto deves (a enviar). Sem saldo líquido
 *  (Fase 15): "No total, deves X" misturava as duas coisas num valor que não
 *  corresponde a nenhum dinheiro que se envie ou receba — era o que confundia.
 *  Cada mosaico tem cor E ícone (seta a entrar / a sair), para o sentido não
 *  depender só do verde/vermelho. */
export function HomeOverview({ className }: { className?: string }) {
    const { user } = useUser();
    const overview = useBalanceOverview(user?.id);
    const settled = overview && overview.receiveCents === 0 && overview.payCents === 0;

    return (
        <div className={className}>
            <div className="flex items-center gap-3 mb-4">
                <Avatar
                    name={user?.name || user?.email || 'Tu'}
                    src={user ? getUserAvatarUrl(user.id, user.avatar) : undefined}
                    size="md"
                />
                <h2 className="text-2xl font-bold tracking-tight text-ink">
                    Olá, {user?.name || 'amigo'}! 👋
                </h2>
            </div>

            {overview && !settled && (
                <div className="grid grid-cols-2 gap-3">
                    <OverviewTile label="Devem-te" icon="call_received" cents={overview.receiveCents} tone="pos" />
                    <OverviewTile label="Deves" icon="call_made" cents={overview.payCents} tone="neg" />
                </div>
            )}
            {settled && (
                <p className="text-sm font-semibold text-ink-faint">Contas em dia em todo o lado</p>
            )}
        </div>
    );
}

function OverviewTile({ label, icon, cents, tone }: { label: string; icon: IconName; cents: number; tone: 'pos' | 'neg' }) {
    // Zero fica neutro — não há nada a receber/enviar desse lado.
    const color = BALANCE_TEXT[cents > 0 ? tone : 'settled'];
    return (
        <div className="card px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                <Icon name={icon} className={cn('text-base', color)} aria-hidden="true" />
                {label}
            </p>
            <Money as="p" value={fromCents(cents)} className={cn('mt-1 text-2xl font-bold tracking-tight', color)} />
        </div>
    );
}
