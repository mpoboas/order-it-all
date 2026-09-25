'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  usePeopleBalances, useAllExpenses, useGroups, useAllPlaceholders,
  useFriendships, useDirectExpenses,
} from '@/lib/db/hooks';
import { buildPartyMap, canonicalPartyId, groupMembersFromExpand } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import { notify } from '@/lib/notify';
import { friendshipsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { mutationErrorMessage } from '@/lib/db/mutations';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { HeroHeader } from '@/components/features/HeroHeader';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { cn } from '@/lib/utils';
import { formatDayMonthAbbrev, compareExpensesRecentFirst } from '@/lib/expenseDisplay';
import { useAppNavigate } from '@/hooks/useAppNavigate';

const EPS = 0.5;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DIRECT_TARGET = '__direct__';

export default function PersonDetailPage() {
    const params = useParams();
    const userId = params.userId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();
    const confirmAction = useConfirm();

    const people = usePeopleBalances(user?.id);
    const groups = useGroups(user?.id);
    const allExpenses = useAllExpenses();
    const allPlaceholders = useAllPlaceholders();
    const friendships = useFriendships(user?.id);
    const directExpenses = useDirectExpenses(user?.id, userId);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [showDirectSettleUp, setShowDirectSettleUp] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const person = useMemo(() => people?.find((p) => p.userId === userId), [people, userId]);
    const groupsWithBalance = (person?.groups ?? []).filter((g) => Math.abs(g.netCents) >= EPS * 100);
    const hasDirectBalance = Math.abs(person?.directNetCents ?? 0) >= EPS * 100;

    const friendship = useMemo(() => {
        if (!friendships || !user?.id) return undefined;
        return [...friendships.accepted, ...friendships.incoming, ...friendships.outgoing].find(
            (f) => f.user_a === userId || f.user_b === userId,
        );
    }, [friendships, user, userId]);
    const isFriend = friendship?.status === 'accepted';

    // Partes para as ações "+ Despesa"/acerto sem grupo (Fase 8) — só as duas
    // pessoas, ambas utilizadores reais (não há placeholders fora de grupo).
    const directParties = useMemo(() => {
        if (!person || !user?.id) return undefined;
        return new Map([
            [userId, person.party],
            [user.id, { id: user.id, name: user.name || 'Tu', avatar: getUserAvatarUrl(user.id, user.avatar), username: user.username, kind: 'user' as const }],
        ]);
    }, [person, user, userId]);

    const directPairwise = useMemo(() => {
        if (!user?.id || !person || person.directNetCents === 0) return {};
        return person.directNetCents > 0
            ? { [userId]: { [user.id]: person.directNetCents } }
            : { [user.id]: { [userId]: -person.directNetCents } };
    }, [person, user, userId]);

    const goSettleUp = () => {
        const targets = [...groupsWithBalance.map((g) => g.groupId), ...(hasDirectBalance ? [DIRECT_TARGET] : [])];
        if (targets.length === 1) {
            if (targets[0] === DIRECT_TARGET) setShowDirectSettleUp(true);
            else nav.push(`/groups/${targets[0]}/balances`, { haptic: false });
        } else {
            setShowGroupPicker(true);
        }
    };

    const handleRemoveFriend = useCallback(async () => {
        if (!friendship) return;
        if (!(await confirmAction({
            title: isFriend ? 'Desfazer esta amizade?' : 'Cancelar este pedido?',
            tone: 'warning',
            confirmLabel: isFriend ? 'Desfazer' : 'Cancelar pedido',
        }))) return;
        try {
            await friendshipsApi.remove(friendship.id);
            await db.friendships.delete(friendship.id);
            showToast(isFriend ? 'Amizade desfeita' : 'Pedido cancelado', 'success');
            nav.up();
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro'), 'error');
        }
    }, [friendship, isFriend, confirmAction, showToast, nav]);

    const handleRemind = useCallback(() => {
        if (!person || !user?.id) return;
        const key = `debtReminder:global:${user.id}:${userId}`;
        const last = Number(localStorage.getItem(key) ?? '0');
        if (Date.now() - last < REMINDER_COOLDOWN_MS) {
            showToast('Já enviaste um lembrete a esta pessoa hoje', 'info');
            return;
        }
        void notify({
            targetUserIds: [userId],
            excludeUserId: user.id,
            title: '🔔 Lembrete de dívida',
            message: `${user.name} lembra-te que deves ${formatEUR(Math.abs(fromCents(person.netCents)))}.`,
            url: '/people',
        });
        localStorage.setItem(key, String(Date.now()));
        showToast('Lembrete enviado', 'success');
    }, [person, user, userId, showToast]);

    // Despesas partilhadas com esta pessoa, em qualquer grupo comum —
    // recalcula os ids canónicos por grupo para apanhar placeholders
    // reclamados que representem esta pessoa nalgum grupo — mais as despesas
    // diretas sem grupo (Fase 8), `groupName: null` para essas.
    const sharedExpenses = useMemo(() => {
        if (!groups || !allExpenses || !allPlaceholders || !user?.id || !directExpenses) return undefined;
        const result: { expense: (typeof allExpenses)[number]; groupName: string | null }[] = [];
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
        for (const e of directExpenses) {
            if (!e.deleted_at) result.push({ expense: e, groupName: null });
        }
        return result.sort((a, b) => compareExpensesRecentFirst(a.expense, b.expense));
    }, [groups, allExpenses, allPlaceholders, directExpenses, user, userId]);

    if (!isLoggedIn) return null;

    const loading = people === undefined || sharedExpenses === undefined;
    const settled = person ? Math.abs(person.netCents) < EPS : true;

    const personName = person?.party.name ?? 'Pessoa';

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            <HeroHeader
                title={personName}
                subtitle={person?.party.username ? `@${person.party.username}` : undefined}
                background={{ kind: 'gradient', seed: personName }}
                avatars={[{ name: personName, src: person?.party.avatar }]}
                onBack={() => nav.up()}
                topRightAction={isFriend ? {
                    icon: 'add',
                    label: 'Adicionar despesa',
                    onClick: () => setShowAddExpense(true),
                } : undefined}
            />

            <main className="container mx-auto max-w-lg px-2 sm:px-4 pb-4 space-y-4">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : (
                    <>
                        {person && !settled && (
                            <>
                                <div className="card p-4 text-center">
                                    <p className={cn('text-xs font-bold uppercase', person.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                        {person.netCents > 0 ? 'deve-te no total' : 'deves no total'}
                                    </p>
                                    <Money
                                        value={Math.abs(fromCents(person.netCents))}
                                        className={cn('text-2xl font-black', person.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={goSettleUp}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full border border-hairline-strong text-sm font-semibold text-ink-soft bg-surface-sunken hover:bg-hairline/30 active:scale-95 transition"
                                    >
                                        <Icon name="swap_horiz" className="text-base" />
                                        Acertar contas
                                    </button>
                                    {person.netCents > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleRemind}
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full border border-hairline-strong text-sm font-semibold text-ink-soft bg-surface-sunken hover:bg-hairline/30 active:scale-95 transition"
                                        >
                                            <Icon name="notifications" className="text-base" />
                                            Lembrar
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        {settled && <p className="text-sm text-ink-faint">Contas em dia.</p>}

                        {friendship && (
                            <button
                                type="button"
                                onClick={handleRemoveFriend}
                                className="text-xs text-ink-faint hover:text-danger transition-colors"
                            >
                                {isFriend ? 'Desfazer amizade' : friendship.requested_by === user?.id ? 'Cancelar pedido' : 'Recusar pedido'}
                            </button>
                        )}

                        {(sharedExpenses ?? []).length === 0 ? (
                            <p className="text-center text-ink-soft py-12">Sem despesas em comum.</p>
                        ) : (
                            <div className="card divide-y divide-hairline overflow-hidden">
                                {(sharedExpenses ?? []).map(({ expense, groupName }) => {
                                    const { day, month } = formatDayMonthAbbrev(expense.date);
                                    const href = groupName
                                        ? `/groups/${expense.group_id}/expenses/${expense.id}`
                                        : `/expenses/${expense.id}`;
                                    return (
                                    <button
                                        key={expense.id}
                                        type="button"
                                        onClick={() => nav.push(href, { haptic: false })}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
                                    >
                                        <CategoryIcon category={expense.category} />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-ink truncate">{expense.description}</p>
                                            <p className="text-xs text-ink-faint truncate">
                                                {groupName ?? 'Despesa direta'} · {day} {month}.
                                            </p>
                                        </div>
                                        <Money value={expense.amount} className="font-semibold text-ink shrink-0" />
                                        <Icon name="chevron_right" className="text-ink-faint" />
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </main>

            <Sheet isOpen={showGroupPicker} onClose={() => setShowGroupPicker(false)} title="Acertar contas em…" size="medium">
                <ul className="divide-y divide-hairline">
                    {groupsWithBalance.map((g) => (
                        <li key={g.groupId}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGroupPicker(false);
                                    nav.push(`/groups/${g.groupId}/balances`, { haptic: false });
                                }}
                                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors"
                            >
                                <span className="font-medium text-ink truncate">{g.groupName}</span>
                                <span className={cn('text-sm font-semibold shrink-0', g.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                    {g.netCents > 0 ? 'deve-te ' : 'deves '}
                                    {formatEUR(Math.abs(fromCents(g.netCents)))}
                                </span>
                            </button>
                        </li>
                    ))}
                    {hasDirectBalance && person && (
                        <li>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGroupPicker(false);
                                    setShowDirectSettleUp(true);
                                }}
                                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors"
                            >
                                <span className="font-medium text-ink truncate">Despesas diretas</span>
                                <span className={cn('text-sm font-semibold shrink-0', person.directNetCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                    {person.directNetCents > 0 ? 'deve-te ' : 'deves '}
                                    {formatEUR(Math.abs(fromCents(person.directNetCents)))}
                                </span>
                            </button>
                        </li>
                    )}
                </ul>
            </Sheet>

            {directParties && user?.id && (
                <ExpenseFormSheet
                    isOpen={showAddExpense}
                    onClose={() => setShowAddExpense(false)}
                    parties={directParties}
                    currentUserId={user.id}
                    onSaved={() => setShowAddExpense(false)}
                    notifyUrl={(e) => `/expenses/${e.id}`}
                />
            )}

            {directParties && user?.id && (
                <SettleUpSheet
                    isOpen={showDirectSettleUp}
                    onClose={() => setShowDirectSettleUp(false)}
                    parties={directParties}
                    pairwise={directPairwise}
                    currentUserId={user.id}
                    notifyUrl={(id) => `/expenses/${id}`}
                />
            )}

            <GlobalBottomNav />
        </div>
    );
}
