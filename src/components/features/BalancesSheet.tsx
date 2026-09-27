'use client';

import { useMemo, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useGroupLedger } from '@/lib/db/hooks';
import { balanceFor } from '@/lib/ledger/balances';
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

    const ledger = useGroupLedger(groupId);
    const [showSettleUp, setShowSettleUp] = useState(false);

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
