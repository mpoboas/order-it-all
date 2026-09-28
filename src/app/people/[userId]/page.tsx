'use client';

import { useSyncStatus } from '@/context/SyncProvider';
import { BalanceHeroSkeleton, ListSkeleton } from '@/components/ui/ListSkeleton';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { usePeopleBalances, useFriendships, useSharedExpenses } from '@/lib/db/hooks';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import { notify } from '@/lib/notify';
import { friendshipsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { mutationErrorMessage } from '@/lib/db/mutations';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { HeroHeader } from '@/components/features/HeroHeader';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { QuickActions } from '@/components/ui/QuickActions';
import { Balance } from '@/components/ui/Balance';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { formatDayMonthAbbrev } from '@/lib/expenseDisplay';
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
    const { ready: syncReady } = useSyncStatus();
    const friendships = useFriendships(user?.id);
    const sharedExpenses = useSharedExpenses(user?.id, userId);
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
            else nav.push(`/groups/${targets[0]}/expenses?abrir=acertar`, { haptic: false });
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

    if (!isLoggedIn) return null;

    // Duas regiões, duas prontidões — cada uma aparece assim que os seus
    // próprios dados chegarem, sem esperar pela mais lenta das duas (Fase 14).
    // Com a cache local ainda vazia (1.ª sincronização a decorrer), "não
    // encontrei esta pessoa / sem despesas" é só "ainda não chegou" — mostrar
    // "Contas em dia" e "Sem despesas em comum" nessa altura era mentira.
    const peopleLoading = people === undefined || (!person && !syncReady);
    const sharedLoading = sharedExpenses === undefined || (sharedExpenses.length === 0 && !syncReady);
    const settled = person ? Math.abs(person.netCents) < EPS : true;

    // A carregar: capa neutra (azul) e sem nome, em vez de "Pessoa" numa cor
    // que depois salta para a da pessoa.
    const personName = person?.party.name ?? (peopleLoading ? '' : 'Pessoa');

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
                {peopleLoading ? (
                    <BalanceHeroSkeleton />
                ) : (
                    <>
                        {person && !settled && (
                            <>
                                <div className="card p-5">
                                    <Balance
                                        cents={person.netCents}
                                        labels={{ pos: 'No total, deve-te', neg: 'No total, deves' }}
                                        size="hero"
                                        align="center"
                                    />
                                </div>
                                <QuickActions
                                    actions={[
                                        { icon: 'swap_horiz', label: 'Acertar contas', onClick: goSettleUp, primary: true },
                                        ...(person.netCents > 0
                                            ? [{ icon: 'notifications' as const, label: 'Lembrar', onClick: handleRemind }]
                                            : []),
                                    ]}
                                />
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
                    </>
                )}

                {/* Região independente do saldo acima — aparece assim que a
                    sua própria query resolver, sem esperar por `people` nem
                    vice-versa (Fase 14). */}
                {sharedLoading ? (
                    <ListSkeleton rows={4} leading="category" />
                ) : sharedExpenses.length === 0 ? (
                    <p className="text-center text-ink-soft py-12">Sem despesas em comum.</p>
                ) : (
                    <div className="card divide-y divide-hairline overflow-hidden">
                        {sharedExpenses.map(({ expense, groupName }) => {
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
            </main>

            <Sheet isOpen={showGroupPicker} onClose={() => setShowGroupPicker(false)} title="Acertar contas em…" size="medium">
                <ul className="divide-y divide-hairline">
                    {groupsWithBalance.map((g) => (
                        <li key={g.groupId}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGroupPicker(false);
                                    nav.push(`/groups/${g.groupId}/expenses?abrir=acertar`, { haptic: false });
                                }}
                                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors"
                            >
                                <span className="font-medium text-ink truncate">{g.groupName}</span>
                                <Balance cents={g.netCents} labels={{ pos: 'deve-te', neg: 'deves' }} />
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
                                <Balance cents={person.directNetCents} labels={{ pos: 'deve-te', neg: 'deves' }} />
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
