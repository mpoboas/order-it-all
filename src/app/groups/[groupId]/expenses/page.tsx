'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useExpenses, useGroupLedger } from '@/lib/db/hooks';
import { useSyncStatus } from '@/context/SyncProvider';
import { balanceFor } from '@/lib/ledger/balances';
import { groupExpensesByMonth } from '@/lib/expenseDisplay';
import { GroupCoverHeader } from '@/components/features/GroupCoverHeader';
import { GroupTabs } from '@/components/features/GroupTabs';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';
import { BalanceBand } from '@/components/features/BalanceBand';
import { ActionChipRow } from '@/components/features/ActionChipRow';
import { ExpenseRow } from '@/components/features/ExpenseRow';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { GroupMembersSheet } from '@/components/features/GroupMembersSheet';
import { TotalsSheet } from '@/components/features/TotalsSheet';
import { expensesToCsv } from '@/lib/ledger/csv';
import { partyLabel } from '@/lib/parties';
import { getCategory } from '@/lib/ledger/categories';
import { getFabBottom } from '@/lib/bottomDock';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function GroupExpensesPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { currentGroup, isAdmin } = useGroup();

    const expensesQuery = useExpenses(groupId);
    const expenses = useMemo(
        () => (expensesQuery ?? []).filter((e) => !e.deleted_at),
        [expensesQuery],
    );
    const ledger = useGroupLedger(groupId);
    const parties = ledger?.parties;
    const { groupSyncing } = useSyncStatus();
    const loading = expensesQuery === undefined || ledger === undefined || (expenses.length === 0 && groupSyncing);

    const [showForm, setShowForm] = useState(false);
    const [showMembers, setShowMembers] = useState(false);
    const [showSettleUp, setShowSettleUp] = useState(false);
    const [showTotals, setShowTotals] = useState(false);
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const userId = user?.id;
    const myBalance = useMemo(() => {
        if (!ledger || !userId) return null;
        return balanceFor(userId, ledger.pairwise, ledger.net);
    }, [ledger, userId]);

    // Pesquisa por descrição, categoria ou pessoa (pagador/participante) —
    // sem acentos/maiúsculas, à semelhança do resto da app.
    const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const searchNorm = normalize(search.trim());
    const filteredExpenses = useMemo(() => {
        if (!searchNorm || !parties) return expenses;
        return expenses.filter((e) => {
            const haystack = [
                e.description,
                getCategory(e.category).label,
                ...e.payers.map((p) => partyLabel(p.party, parties)),
                ...e.shares.map((s) => partyLabel(s.party, parties)),
            ]
                .map(normalize)
                .join(' ');
            return haystack.includes(searchNorm);
        });
    }, [expenses, searchNorm, parties]);

    const monthGroups = useMemo(() => groupExpensesByMonth(filteredExpenses), [filteredExpenses]);
    // Não é só `currentGroup.members` — inclui placeholders (membros sem
    // conta), que também são partes válidas nas despesas do grupo.
    const memberCount = parties?.size || currentGroup?.members?.length || 0;

    const handleExport = () => {
        if (!parties) return;
        const csv = expensesToCsv(expenses, parties);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentGroup?.name || 'despesas'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            {currentGroup && (
                <GroupCoverHeader
                    group={currentGroup}
                    memberCount={memberCount}
                    onMembersClick={() => setShowMembers(true)}
                    isAdmin={isAdmin}
                />
            )}
            <GroupTabs groupId={groupId} isAdmin={isAdmin} />
            {!loading && parties && myBalance && (
                <>
                    <BalanceBand
                        netCents={myBalance.netCents}
                        lines={myBalance.lines}
                        parties={parties}
                        onSeeAllClick={() => nav.push(`/groups/${groupId}/balances`)}
                    />
                    <ActionChipRow
                        chips={[
                            { icon: 'swap_horiz', label: 'Acertar contas', onClick: () => setShowSettleUp(true) },
                            { icon: 'balance', label: 'Saldos', onClick: () => nav.push(`/groups/${groupId}/balances`) },
                            { icon: 'calculate', label: 'Totais', onClick: () => setShowTotals(true) },
                            { icon: 'drive_file_move', label: 'Exportar', onClick: handleExport },
                            { icon: 'filter_list', label: 'Pesquisar', onClick: () => setShowSearch((v) => !v) },
                        ]}
                    />
                    {showSearch && (
                        <div className="px-4 py-2 border-b border-hairline bg-surface">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Pesquisar por descrição, categoria ou pessoa…"
                                autoFocus
                                className="w-full px-3 py-2 rounded-xl border border-hairline bg-surface-sunken focus:bg-surface outline-none text-sm"
                            />
                        </div>
                    )}
                </>
            )}

            <main className="container mx-auto max-w-2xl">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : expenses.length === 0 ? (
                    <div className="text-center py-20 px-4 animate-fade-in-up">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary-50 dark:bg-primary-950 text-primary-500 flex items-center justify-center">
                            <Icon name="receipt_long" className="text-5xl" />
                        </div>
                        <h3 className="text-xl font-semibold text-ink mb-2">Ainda não há despesas</h3>
                        <p className="text-ink-soft mb-6">Adiciona a primeira para começar a dividir contas.</p>
                        <button onClick={() => setShowForm(true)} className="btn btn-primary px-6 py-3">
                            Adicionar despesa
                        </button>
                    </div>
                ) : filteredExpenses.length === 0 ? (
                    <div className="text-center py-20 px-4 animate-fade-in-up">
                        <p className="text-ink-soft">Nenhuma despesa encontrada.</p>
                    </div>
                ) : (
                    <div className="px-2 sm:px-4 py-4 space-y-4">
                        {monthGroups.map((group) => (
                            <div key={group.key} className="card overflow-hidden p-0">
                                {group.heading && (
                                    <div className="px-4 pt-3 pb-1">
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                                            {group.heading}
                                        </h3>
                                    </div>
                                )}
                                <div className="divide-y divide-hairline">
                                    {group.expenses.map((expense) => (
                                        <ExpenseRow
                                            key={expense.id}
                                            expense={expense}
                                            parties={parties!}
                                            myId={user?.id || ''}
                                            onClick={() => nav.push(`/groups/${groupId}/expenses/${expense.id}`, { haptic: false })}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {parties && (
                <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="fixed right-4 z-30 h-14 px-5 rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 flex items-center gap-2 font-semibold active:scale-95 transition"
                    style={{ bottom: getFabBottom(true) }}
                >
                    <Icon name="add" className="text-xl" />
                    Despesa
                </button>
            )}

            {parties && user?.id && (
                <ExpenseFormSheet
                    isOpen={showForm}
                    onClose={() => setShowForm(false)}
                    groupId={groupId}
                    parties={parties}
                    currentUserId={user.id}
                    onSaved={() => setShowForm(false)}
                    onOpenItems={(expense) => nav.push(`/groups/${groupId}/expenses/${expense.id}/items`, { haptic: false })}
                />
            )}

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

            {currentGroup && (
                <GroupMembersSheet isOpen={showMembers} onClose={() => setShowMembers(false)} group={currentGroup} />
            )}

            {parties && user?.id && (
                <TotalsSheet
                    isOpen={showTotals}
                    onClose={() => setShowTotals(false)}
                    expenses={expenses}
                    parties={parties}
                    currentUserId={user.id}
                />
            )}
        </div>
    );
}
