'use client';

import { useCallback, useMemo, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useGroupLedger } from '@/lib/db/hooks';
import { balanceFor } from '@/lib/ledger/balances';
import { fromCents } from '@/lib/ledger/money';
import { partyLabel, isUnclaimedPlaceholder } from '@/lib/parties';
import { notify, notifiableUserIds } from '@/lib/notify';
import { formatEUR } from '@/lib/money';
import { useToast } from '@/context/ToastContext';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { cn } from '@/lib/utils';

const EPS = 0.005;

interface BalancesSheetProps {
    isOpen: boolean;
    onClose: () => void;
    groupId: string;
}

/** Saldos do grupo — era uma página própria (`/groups/[groupId]/balances`),
 *  agora uma sheet cheia aberta a partir do chip "Saldos" do
 *  `GroupOverviewBar` (hero) ou do "ver todos" do `BalanceBand`, aí dentro.
 *  Autossuficiente: só precisa do `groupId`, busca o resto sozinha. A rota
 *  antiga (`balances/page.tsx`) fica intacta para deep links/notificações
 *  de lembrete antigas, mas deixou de ser o caminho principal. */
export function BalancesSheet({ isOpen, onClose, groupId }: BalancesSheetProps) {
    const { user } = useUser();
    const { showToast } = useToast();

    const ledger = useGroupLedger(groupId);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showSettleUp, setShowSettleUp] = useState(false);

    // "Lembrete de dívida" manual — 1 por dia por par, para não spammar.
    const handleRemind = useCallback((debtorPartyId: string, amountCents: number) => {
        if (!ledger || !user?.id) return;
        const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
        const key = `debtReminder:${groupId}:${user.id}:${debtorPartyId}`;
        const last = Number(localStorage.getItem(key) ?? '0');
        if (Date.now() - last < REMINDER_COOLDOWN_MS) {
            showToast('Já enviaste um lembrete a esta pessoa hoje', 'info');
            return;
        }
        const targets = notifiableUserIds([debtorPartyId], ledger.parties, user.id);
        if (targets.length === 0) {
            showToast('Esta pessoa não tem conta para notificar', 'info');
            return;
        }
        void notify({
            targetUserIds: targets,
            title: '🔔 Lembrete de dívida',
            message: `${partyLabel(user.id, ledger.parties)} lembra-te que deves ${formatEUR(Math.abs(amountCents) / 100)}.`,
            url: `/groups/${groupId}/balances`,
        });
        localStorage.setItem(key, String(Date.now()));
        showToast('Lembrete enviado', 'success');
    }, [ledger, user, groupId, showToast]);

    const rows = useMemo(() => {
        if (!ledger) return [];
        return Array.from(ledger.parties.keys())
            .filter((id) => !ledger.parties.get(id)?.claimedBy) // reclamado → representado pelo utilizador que o reclamou
            .map((id) => ({ id, ...balanceFor(id, ledger.pairwise, ledger.net) }))
            .sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
    }, [ledger]);

    return (
        <>
            <Sheet
                isOpen={isOpen}
                onClose={onClose}
                title="Saldos"
                size="full"
                footer={
                    ledger && user?.id ? (
                        <Button block onClick={() => setShowSettleUp(true)}>
                            <Icon name="swap_horiz" className="text-xl" />
                            Acertar contas
                        </Button>
                    ) : undefined
                }
            >
                {!ledger ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : (
                    <div className="card divide-y divide-hairline overflow-hidden">
                        {rows.map((row) => {
                            const party = ledger.parties.get(row.id);
                            if (!party) return null;
                            const settled = Math.abs(row.netCents) <= EPS * 100;
                            const expanded = expandedId === row.id;
                            return (
                                <div key={row.id}>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(expanded ? null : row.id)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
                                    >
                                        <Avatar name={party.name} src={party.avatar} size="sm" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-ink truncate">{party.name}</p>
                                            {isUnclaimedPlaceholder(row.id, ledger.parties) && (
                                                <Badge variant="neutral" className="mt-0.5">Sem conta</Badge>
                                            )}
                                        </div>
                                        {settled ? (
                                            <span className="text-sm text-ink-faint shrink-0">Contas em dia</span>
                                        ) : (
                                            <div className="text-right shrink-0">
                                                <p className={cn('text-[10px] font-bold uppercase', row.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                                    {row.netCents > 0 ? 'recebe' : 'deve'}
                                                </p>
                                                <Money
                                                    value={Math.abs(fromCents(row.netCents))}
                                                    className={cn('text-sm font-bold', row.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}
                                                />
                                            </div>
                                        )}
                                        {row.lines.length > 0 && (
                                            <Icon
                                                name="keyboard_arrow_down"
                                                className={cn('text-ink-faint transition-transform', expanded && 'rotate-180')}
                                            />
                                        )}
                                    </button>
                                    {expanded && row.lines.length > 0 && (
                                        <div className="px-4 pb-3 pl-14 space-y-1.5">
                                            {row.lines.map((line) => (
                                                <div key={line.party} className="flex items-center justify-between gap-2">
                                                    <p className="text-sm text-ink-soft">
                                                        {line.amountCents > 0 ? (
                                                            <><span className="font-medium text-ink">{partyLabel(line.party, ledger.parties)}</span> deve-lhe{' '}
                                                                <span className="font-semibold text-success-fg">
                                                                    <Money value={fromCents(line.amountCents)} />
                                                                </span></>
                                                        ) : (
                                                            <>Deve{' '}
                                                                <span className="font-semibold text-warning-fg">
                                                                    <Money value={fromCents(-line.amountCents)} />
                                                                </span>{' '}
                                                                a <span className="font-medium text-ink">{partyLabel(line.party, ledger.parties)}</span></>
                                                        )}
                                                    </p>
                                                    {row.id === user?.id && line.amountCents > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemind(line.party, line.amountCents)}
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
                )}
            </Sheet>

            {ledger && user?.id && (
                <SettleUpSheet
                    isOpen={showSettleUp}
                    onClose={() => setShowSettleUp(false)}
                    groupId={groupId}
                    parties={ledger.parties}
                    pairwise={ledger.pairwise}
                    currentUserId={user.id}
                />
            )}
        </>
    );
}
