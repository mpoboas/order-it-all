'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useAllExpenses, useGroups } from '@/lib/db/hooks';
import { buildActivityFeed, type ActivityVerb } from '@/lib/ledger/feed';
import { Header } from '@/components/layout/Header';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { formatRelativeOrDate, cn } from '@/lib/utils';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { useAppNavigate } from '@/hooks/useAppNavigate';

const VERB_LABEL: Record<ActivityVerb, string> = {
    added: 'adicionou',
    updated: 'editou',
    deleted: 'eliminou',
    payment: 'registou um pagamento de',
};

export default function ActivityPage() {
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const expensesQuery = useAllExpenses();
    const groupsQuery = useGroups(user?.id);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const groupNameById = useMemo(
        () => new Map((groupsQuery ?? []).map((g) => [g.id, g.name])),
        [groupsQuery],
    );

    const feed = useMemo(() => {
        if (!expensesQuery) return undefined;
        return buildActivityFeed(expensesQuery).slice(0, 60);
    }, [expensesQuery]);

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            <Header
                title="Order It All!"
                icon={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src="/favicon.svg"
                        alt=""
                        className="w-full h-full object-contain p-1"
                    />
                }
            />

            <main className="container mx-auto max-w-lg px-2 sm:px-4">
                <h2 className="text-2xl md:text-3xl font-bold text-ink mb-4 mt-4 animate-fade-in-up">Atividade</h2>
                {!feed ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : feed.length === 0 ? (
                    <div className="text-center py-20 px-4">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary-50 dark:bg-primary-950 text-primary-500 flex items-center justify-center">
                            <Icon name="activity" className="text-5xl" />
                        </div>
                        <h3 className="text-xl font-semibold text-ink mb-2">Ainda não há atividade</h3>
                        <p className="text-ink-soft mb-6 max-w-sm mx-auto">As despesas dos teus grupos vão aparecer aqui, assim que houver alguma.</p>
                        <Button onClick={() => nav.push('/groups', { haptic: false })}>
                            <Icon name="groups" className="text-xl" />
                            Ver grupos
                        </Button>
                    </div>
                ) : (
                    <ul className="divide-y divide-hairline">
                        {feed.map((item) => {
                            const actor = item.actorId === item.expense.created_by
                                ? item.expense.expand?.created_by
                                : item.actorId === item.expense.updated_by
                                    ? item.expense.expand?.updated_by
                                    : item.expense.expand?.deleted_by;
                            const actorName = actor?.name || 'Alguém';
                            const groupName = item.expense.group_id
                                ? groupNameById.get(item.expense.group_id) || 'um grupo'
                                : null; // despesa direta (Fase 8) — sem grupo, sem clausula "em X"
                            const expenseHref = item.expense.group_id
                                ? `/groups/${item.expense.group_id}/expenses/${item.expense.id}`
                                : `/expenses/${item.expense.id}`;

                            return (
                                <li key={`${item.expense.id}-${item.verb}`}>
                                    <button
                                        type="button"
                                        onClick={() => nav.push(expenseHref, { haptic: false })}
                                        className="w-full flex items-start gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-2 -mx-2 transition-colors"
                                    >
                                        <div className="relative shrink-0">
                                            <CategoryIcon category={item.expense.category} />
                                            <span className="absolute -bottom-1 -right-1 ring-2 ring-surface rounded-full">
                                                <Avatar name={actorName} src={getUserAvatarUrl(actor?.id || '', actor?.avatar)} size="xs" />
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={cn('text-sm text-ink', item.verb === 'deleted' && 'line-through text-ink-faint')}>
                                                <span className="font-semibold">{actorName}</span>{' '}
                                                {VERB_LABEL[item.verb]}{' '}
                                                {item.verb === 'payment' ? (
                                                    <Money value={item.expense.amount} className="font-semibold" />
                                                ) : (
                                                    <>«{item.expense.description || 'despesa'}»</>
                                                )}
                                                {groupName && <> em <span className="font-semibold">{groupName}</span></>}
                                            </p>
                                            <p className="text-xs text-ink-faint mt-0.5">{formatRelativeOrDate(item.at)}</p>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>

            <GlobalBottomNav />
        </div>
    );
}
