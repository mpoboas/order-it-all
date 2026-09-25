'use client';

import { useCallback, useMemo, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useGroupLedger } from '@/lib/db/hooks';
import { balanceFor } from '@/lib/ledger/balances';
import { partyLabel } from '@/lib/parties';
import { notify, notifiableUserIds } from '@/lib/notify';
import { formatEUR } from '@/lib/money';
import { useToast } from '@/context/ToastContext';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { BalanceRows } from '@/components/features/BalanceRows';


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
                    <BalanceRows
                        rows={rows}
                        parties={ledger.parties}
                        currentUserId={user?.id}
                        onRemind={handleRemind}
                    />
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
