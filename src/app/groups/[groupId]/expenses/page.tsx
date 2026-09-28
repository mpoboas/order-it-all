'use client';

import { ListSkeleton } from '@/components/ui/ListSkeleton';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useExpenses, useGroupLedger, useGroup as useGroupRecord } from '@/lib/db/hooks';
import { useSyncStatus } from '@/context/SyncProvider';
import { groupExpensesByMonth } from '@/lib/expenseDisplay';
import { HeroHeader } from '@/components/features/HeroHeader';
import { GroupTabs } from '@/components/features/GroupTabs';
import { GroupOverviewBar } from '@/components/features/GroupOverviewBar';
import { ExpandableFab } from '@/components/features/ExpandableFab';
import { getGroupHeroBackground, groupHeroAvatars } from '@/lib/groupAvatars';
import { Icon } from '@/components/ui/Icon';
import { ExpenseRow } from '@/components/features/ExpenseRow';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function GroupExpensesPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { isAdmin } = useGroup();

    // Direto do Dexie (já aquecido pela lista de grupos), não via
    // `GroupContext.currentGroup` — esse só atualiza num efeito do layout,
    // um tick depois deste render (ver Fase 14).
    const currentGroup = useGroupRecord(groupId);
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

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const monthGroups = useMemo(() => groupExpensesByMonth(expenses), [expenses]);
    // Não é só `currentGroup.members` — inclui placeholders (membros sem
    // conta), que também são partes válidas nas despesas do grupo.
    const memberCount = parties?.size || currentGroup?.members?.length || 0;
    const heroAvatars = currentGroup ? groupHeroAvatars(currentGroup) : [];

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            {currentGroup && (
                <HeroHeader
                    variant="compact"
                    title={currentGroup.name}
                    background={getGroupHeroBackground(currentGroup)}
                    avatars={heroAvatars}
                    avatarOverflowCount={Math.max(0, memberCount - heroAvatars.length)}
                    onBack={() => nav.up()}
                    topRightAction={isAdmin ? {
                        icon: 'settings',
                        label: 'Definições do grupo',
                        onClick: () => nav.push(`/groups/${currentGroup.id}/settings`, { haptic: false }),
                    } : undefined}
                />
            )}
            <GroupOverviewBar groupId={groupId} />
            <GroupTabs groupId={groupId} isAdmin={isAdmin} />

            <main className="container mx-auto max-w-2xl pb-24">
                {loading ? (
                    <div className="px-2 sm:px-4 py-4">
                        <ListSkeleton rows={6} leading="dated" />
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
                <ExpandableFab icon="add" label="Despesa" onClick={() => setShowForm(true)} />
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
        </div>
    );
}
