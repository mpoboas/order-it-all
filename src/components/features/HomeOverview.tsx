'use client';

import { useUser } from '@/context/UserContext';
import { useBalanceOverview } from '@/lib/db/hooks';
import { fromCents } from '@/lib/ledger/money';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { BALANCE_TEXT, balanceTone } from '@/components/ui/Balance';
import { cn } from '@/lib/utils';

/** Topo do Início — avatar + saudação, seguido do cartão "Visão geral": o
 *  saldo LÍQUIDO em destaque (o número que responde a "como estou?") e, por
 *  baixo, as duas parcelas que o formam — quanto te devem e quanto deves.
 *  Substitui a antiga barra proporcional verde/vermelha a toda a largura
 *  (Fase 15): blocos saturados com texto branco gritavam mais do que o
 *  próprio valor, falhavam contraste AA nas etiquetas pequenas e liam-se
 *  como uma barra de progresso. A cor passa a viver só nos números. */
export function HomeOverview({ className }: { className?: string }) {
    const { user } = useUser();
    const overview = useBalanceOverview(user?.id);
    const settled = overview && overview.receiveCents === 0 && overview.payCents === 0;
    const netCents = overview ? overview.receiveCents - overview.payCents : 0;
    const netTone = balanceTone(netCents);

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
                <div className="card p-5 text-center">
                    <p className="text-sm font-medium text-ink-soft">
                        {netTone === 'pos' ? 'No total, devem-te' : netTone === 'neg' ? 'No total, deves' : 'No total, estás equilibrado'}
                    </p>
                    <Money
                        as="p"
                        value={Math.abs(fromCents(netCents))}
                        className={cn('mt-1 text-4xl font-bold tracking-tight', BALANCE_TEXT[netTone])}
                    />

                    <div className="mt-4 pt-4 border-t border-hairline grid grid-cols-2 divide-x divide-hairline">
                        <div>
                            <p className="text-xs font-medium text-ink-soft">Devem-te</p>
                            <Money
                                as="p"
                                value={fromCents(overview.receiveCents)}
                                className={cn('text-base font-semibold tracking-tight', BALANCE_TEXT[overview.receiveCents > 0 ? 'pos' : 'settled'])}
                            />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-ink-soft">Deves</p>
                            <Money
                                as="p"
                                value={fromCents(overview.payCents)}
                                className={cn('text-base font-semibold tracking-tight', BALANCE_TEXT[overview.payCents > 0 ? 'neg' : 'settled'])}
                            />
                        </div>
                    </div>
                </div>
            )}
            {settled && (
                <p className="text-sm font-semibold text-ink-faint">Contas em dia em todo o lado</p>
            )}
        </div>
    );
}
