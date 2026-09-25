'use client';

import { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useExpenses, useGroupLedger } from '@/lib/db/hooks';
import { balanceFor } from '@/lib/ledger/balances';
import { expensesToCsv } from '@/lib/ledger/csv';
import { BalanceBand } from '@/components/features/BalanceBand';
import { ActionChipRow } from '@/components/features/ActionChipRow';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { BalancesSheet } from '@/components/features/BalancesSheet';
import { TotalsSheet } from '@/components/features/TotalsSheet';

interface GroupOverviewBarProps {
    groupId: string;
}

/** Faixa entre o nome do grupo (hero) e as tabs (Despesas/Viagens) — saldo
 *  líquido + as ações do grupo (Acertar contas, Saldos, Totais, Exportar).
 *  Autossuficiente e IDÊNTICA nas duas tabs — mesma lógica do `HomeOverview`
 *  no Início: o que fica entre o título e as tabs não muda consoante a tab
 *  ativa por baixo, só o conteúdo abaixo das tabs varia. "Pesquisar" fica
 *  de fora de propósito — filtra a lista de despesas, que só existe na
 *  página de Despesas, por isso vive lá, não aqui. */
export function GroupOverviewBar({ groupId }: GroupOverviewBarProps) {
    const { user } = useUser();
    const { currentGroup } = useGroup();
    const ledger = useGroupLedger(groupId);
    const expensesQuery = useExpenses(groupId);
    const [showSettleUp, setShowSettleUp] = useState(false);
    const [showBalances, setShowBalances] = useState(false);
    const [showTotals, setShowTotals] = useState(false);

    const myBalance = ledger && user?.id ? balanceFor(user.id, ledger.pairwise, ledger.net) : null;
    const expenses = (expensesQuery ?? []).filter((e) => !e.deleted_at);

    const handleExport = () => {
        if (!ledger) return;
        const csv = expensesToCsv(expenses, ledger.parties);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentGroup?.name || 'despesas'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Nunca `return null` — isso empurra o que está por baixo (tabs, lista)
    // quando o ledger resolve, um "pop" isolado a esta faixa. Um placeholder
    // com a mesma geometria (mesmo padding/alturas dos dois blocos reais)
    // troca para conteúdo sem mexer no resto do ecrã (Fase 14).
    if (!ledger || !myBalance) {
        return (
            <div aria-hidden className="animate-pulse">
                <div className="px-4 py-3 bg-surface flex justify-center">
                    <div className="h-4 w-40 rounded bg-surface-sunken" />
                </div>
                <div className="flex gap-2 px-4 py-2.5 border-b border-hairline bg-surface">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-8 w-24 rounded-full bg-surface-sunken shrink-0" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <BalanceBand
                netCents={myBalance.netCents}
                lines={myBalance.lines}
                parties={ledger.parties}
                onSeeAllClick={() => setShowBalances(true)}
            />
            <ActionChipRow
                chips={[
                    { icon: 'swap_horiz', label: 'Acertar contas', onClick: () => setShowSettleUp(true) },
                    { icon: 'balance', label: 'Saldos', onClick: () => setShowBalances(true) },
                    { icon: 'calculate', label: 'Totais', onClick: () => setShowTotals(true) },
                    { icon: 'drive_file_move', label: 'Exportar', onClick: handleExport },
                ]}
            />

            {user?.id && (
                <SettleUpSheet
                    isOpen={showSettleUp}
                    onClose={() => setShowSettleUp(false)}
                    groupId={groupId}
                    parties={ledger.parties}
                    pairwise={ledger.pairwise}
                    currentUserId={user.id}
                />
            )}

            <BalancesSheet isOpen={showBalances} onClose={() => setShowBalances(false)} groupId={groupId} />

            {user?.id && (
                <TotalsSheet
                    isOpen={showTotals}
                    onClose={() => setShowTotals(false)}
                    expenses={expenses}
                    parties={ledger.parties}
                    currentUserId={user.id}
                />
            )}
        </>
    );
}
