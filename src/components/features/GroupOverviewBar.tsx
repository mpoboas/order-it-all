'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useExpenses, useGroupLedger } from '@/lib/db/hooks';
import { balanceFor } from '@/lib/ledger/balances';
import { expensesToCsv } from '@/lib/ledger/csv';
import { BalanceBand } from '@/components/features/BalanceBand';
import { QuickActions } from '@/components/ui/QuickActions';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { BalancesSheet } from '@/components/features/BalancesSheet';
import { useAppNavigate } from '@/hooks/useAppNavigate';

interface GroupOverviewBarProps {
    groupId: string;
}

/** Faixa entre o nome do grupo (hero) e as tabs (Despesas/Viagens) — saldo
 *  líquido + as ações do grupo (Acertar contas, Saldos, Resumo, Exportar).
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
    const nav = useAppNavigate();

    // `?abrir=saldos|acertar` — outros ecrãs (detalhe de amigo, Definições do grupo)
    // abrem o grupo já com a folha certa aberta. Lido uma vez e tirado do URL,
    // para voltar atrás não a reabrir.
    useEffect(() => {
        const url = new URL(window.location.href);
        const open = url.searchParams.get('abrir');
        if (!open) return;
        void Promise.resolve().then(() => {
            if (open === 'saldos') setShowBalances(true);
            if (open === 'acertar') setShowSettleUp(true);
        });
        url.searchParams.delete('abrir');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }, []);

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
    if (!ledger || !myBalance) return <GroupOverviewSkeleton />;

    return (
        <>
            <BalanceBand
                netCents={myBalance.netCents}
                lines={myBalance.lines}
                parties={ledger.parties}
                onSeeAllClick={() => setShowBalances(true)}
            />
            <QuickActions
                className="px-4 py-3 bg-surface border-b border-hairline"
                actions={[
                    { icon: 'swap_horiz', label: 'Acertar contas', onClick: () => setShowSettleUp(true), primary: true },
                    { icon: 'balance', label: 'Saldos', onClick: () => setShowBalances(true) },
                    { icon: 'calculate', label: 'Resumo', onClick: () => nav.push(`/groups/${groupId}/summary`, { haptic: false }) },
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

        </>
    );
}

/** Placeholder do resumo + ações rápidas — mesma geometria dos blocos reais.
 *  Também usado pelo portão do grupo (`groups/[groupId]/layout.tsx`). */
export function GroupOverviewSkeleton() {
    return (
        <div aria-hidden className="animate-pulse">
            <div className="px-4 pt-3 pb-1 bg-surface space-y-1.5">
                <div className="h-3.5 w-48 rounded bg-surface-sunken" />
                <div className="h-3.5 w-40 rounded bg-surface-sunken" />
            </div>
            <div className="flex justify-center px-4 py-3 border-b border-hairline bg-surface">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 max-w-24 flex flex-col items-center gap-1.5 py-1">
                        <div className="w-12 h-12 rounded-full bg-surface-sunken" />
                        <div className="h-3 w-12 rounded-full bg-surface-sunken" />
                    </div>
                ))}
            </div>
        </div>
    );
}
