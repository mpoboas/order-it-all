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
import { BrandBand } from '@/components/layout/BrandBand';
import { useSyncStatus } from '@/context/SyncProvider';

/** Topo do Início — avatar + saudação, seguido de dois mosaicos lado a lado:
 *  quanto te devem (a receber) e quanto deves (a enviar). Sem saldo líquido
 *  (Fase 15): "No total, deves X" misturava as duas coisas num valor que não
 *  corresponde a nenhum dinheiro que se envie ou receba — era o que confundia.
 *  Cada mosaico tem cor E ícone (seta a entrar / a sair), para o sentido não
 *  depender só do verde/vermelho. */
export function HomeOverview({ className }: { className?: string }) {
    const { user } = useUser();
    const overview = useBalanceOverview(user?.id);
    // Antes da 1.ª sincronização (cache vazia) os saldos dão 0/0 — isso não é
    // "contas em dia", é "ainda não chegou": mosaicos em skeleton.
    const { ready } = useSyncStatus();
    const zero = !overview || (overview.receiveCents === 0 && overview.payCents === 0);
    const loading = zero && !ready;
    const settled = !loading && zero;
    const showTiles = loading || !settled;

    // A saudação vive na faixa azul da marca; os mosaicos sobem por cima do
    // fim da faixa (cartões brancos "pousados" no azul — os valores verde/
    // vermelho precisam de fundo claro para se lerem).
    return (
        <div className={className}>
            <BrandBand overlap={!!showTiles}>
                <div className="flex items-center gap-3">
                    <Avatar
                        name={user?.name || user?.email || 'Tu'}
                        src={user ? getUserAvatarUrl(user.id, user.avatar) : undefined}
                        size="md"
                        className="ring-2 ring-white/50"
                    />
                    <div className="min-w-0">
                        {/* Nome inteiro, com wrap — nunca "Olá, Chimpanzini Banan…". */}
                        <h2 className="text-2xl font-bold leading-tight tracking-tight text-ink break-words text-balance">
                            Olá, {user?.name || 'amigo'}! 👋
                        </h2>
                        {settled && <p className="text-sm font-medium text-ink-soft">Tens as contas em dia.</p>}
                    </div>
                </div>
            </BrandBand>

            {showTiles && (
                <div className="container mx-auto max-w-lg px-2 sm:px-4 -mt-10 relative">
                    <div className="grid grid-cols-2 gap-3">
                        {loading || !overview ? (
                            [0, 1].map((i) => (
                                <div key={i} aria-hidden className="card px-4 py-3">
                                    <div className="animate-pulse">
                                        <div className="h-3.5 w-20 rounded-full bg-surface-sunken" />
                                        <div className="mt-3 h-7 w-28 rounded-full bg-surface-sunken" />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <>
                                <OverviewTile label="Devem-te" icon="call_received" cents={overview.receiveCents} tone="pos" />
                                <OverviewTile label="Deves" icon="call_made" cents={overview.payCents} tone="neg" />
                            </>
                        )}
                    </div>
                </div>
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
