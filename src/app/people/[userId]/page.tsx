'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { usePeopleBalances, useAllExpenses, useGroups, useAllPlaceholders } from '@/lib/db/hooks';
import { buildPartyMap, canonicalPartyId, groupMembersFromExpand } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { formatRelativeOrDate, cn } from '@/lib/utils';
import { useAppNavigate } from '@/hooks/useAppNavigate';

const EPS = 0.5;

export default function PersonDetailPage() {
    const params = useParams();
    const userId = params.userId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();

    const people = usePeopleBalances(user?.id);
    const groups = useGroups(user?.id);
    const allExpenses = useAllExpenses();
    const allPlaceholders = useAllPlaceholders();

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const person = people?.find((p) => p.userId === userId);

    // Despesas partilhadas com esta pessoa, em qualquer grupo comum —
    // recalcula os ids canónicos por grupo para apanhar placeholders
    // reclamados que representem esta pessoa nalgum grupo.
    const sharedExpenses = useMemo(() => {
        if (!groups || !allExpenses || !allPlaceholders || !user?.id) return undefined;
        const result: { expense: (typeof allExpenses)[number]; groupName: string }[] = [];
        for (const group of groups) {
            const parties = buildPartyMap(
                groupMembersFromExpand(group),
                allPlaceholders.filter((p) => p.group_id === group.id),
            );
            const resolve = (id: string) => canonicalPartyId(id, parties);
            const groupExpenses = allExpenses.filter((e) => e.group_id === group.id && !e.deleted_at);
            for (const e of groupExpenses) {
                const partyIds = new Set([...e.payers.map((p) => resolve(p.party)), ...e.shares.map((s) => resolve(s.party))]);
                if (partyIds.has(userId) && partyIds.has(user.id)) {
                    result.push({ expense: e, groupName: group.name });
                }
            }
        }
        return result.sort((a, b) => b.expense.date.localeCompare(a.expense.date));
    }, [groups, allExpenses, allPlaceholders, user, userId]);

    if (!isLoggedIn) return null;

    const loading = people === undefined || sharedExpenses === undefined;
    const settled = person ? Math.abs(person.netCents) < EPS : true;

    return (
        <div className="min-h-dvh bg-app">
            <Header title={person?.party.name ?? 'Pessoa'} showBack />

            <main className="container mx-auto max-w-lg px-2 sm:px-4 py-4 space-y-4">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : (
                    <>
                        {person && !settled && (
                            <div className="card p-4 text-center">
                                <p className={cn('text-xs font-bold uppercase', person.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                    {person.netCents > 0 ? 'deve-te no total' : 'deves no total'}
                                </p>
                                <Money
                                    value={Math.abs(fromCents(person.netCents))}
                                    className={cn('text-2xl font-black', person.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}
                                />
                            </div>
                        )}

                        {(sharedExpenses ?? []).length === 0 ? (
                            <p className="text-center text-ink-soft py-12">Sem despesas em comum.</p>
                        ) : (
                            <div className="card divide-y divide-hairline overflow-hidden">
                                {(sharedExpenses ?? []).map(({ expense, groupName }) => (
                                    <button
                                        key={expense.id}
                                        type="button"
                                        onClick={() => nav.push(`/groups/${expense.group_id}/expenses/${expense.id}`, { haptic: false })}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
                                    >
                                        <CategoryIcon category={expense.category} />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-ink truncate">{expense.description}</p>
                                            <p className="text-xs text-ink-faint truncate">
                                                {groupName} · {formatRelativeOrDate(expense.date)}
                                            </p>
                                        </div>
                                        <Money value={expense.amount} className="font-semibold text-ink shrink-0" />
                                        <Icon name="chevron_right" className="text-ink-faint" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
