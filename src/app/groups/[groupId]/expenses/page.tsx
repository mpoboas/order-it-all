'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useExpenses, useParties } from '@/lib/db/hooks';
import { useSyncStatus } from '@/context/SyncProvider';
import { canonicalPartyId } from '@/lib/parties';
import { netByParty } from '@/lib/ledger/balances';
import { fromCents } from '@/lib/ledger/money';
import { groupExpensesByMonth } from '@/lib/expenseDisplay';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';
import { BalanceBand } from '@/components/features/BalanceBand';
import { ExpenseRow } from '@/components/features/ExpenseRow';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { GroupMembersSheet } from '@/components/features/GroupMembersSheet';
import { getFabBottom } from '@/lib/bottomDock';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function GroupExpensesPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { currentGroup } = useGroup();

    const expensesQuery = useExpenses(groupId);
    const expenses = useMemo(
        () => (expensesQuery ?? []).filter((e) => !e.deleted_at),
        [expensesQuery],
    );
    const parties = useParties(groupId);
    const { groupSyncing } = useSyncStatus();
    const loading = expensesQuery === undefined || parties === undefined || (expenses.length === 0 && groupSyncing);

    const [showForm, setShowForm] = useState(false);
    const [showMembers, setShowMembers] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const userId = user?.id;
    const net = useMemo(() => {
        if (!parties || !userId) return 0;
        const cents = netByParty(expenses, (id) => canonicalPartyId(id, parties));
        return fromCents(cents[userId] ?? 0);
    }, [expenses, parties, userId]);

    const monthGroups = useMemo(() => groupExpensesByMonth(expenses), [expenses]);
    // Não é só `currentGroup.members` — inclui placeholders (membros sem
    // conta), que também são partes válidas nas despesas do grupo.
    const memberCount = parties?.size || currentGroup?.members?.length || 0;

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            <Header title={currentGroup?.name} showBack groupId={groupId} />
            {!loading && parties && (
                <BalanceBand net={net} memberCount={memberCount} onMembersClick={() => setShowMembers(true)} />
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

            {currentGroup && (
                <GroupMembersSheet isOpen={showMembers} onClose={() => setShowMembers(false)} group={currentGroup} />
            )}
        </div>
    );
}
