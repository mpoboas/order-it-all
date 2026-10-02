'use client';

import { useSyncStatus } from '@/context/SyncProvider';
import { ListSkeleton } from '@/components/ui/ListSkeleton';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { usePeopleBalances, useFriendships } from '@/lib/db/hooks';
import { friendshipsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { mutationErrorMessage } from '@/lib/db/mutations';
import { useToast } from '@/context/ToastContext';
import { notifyEvent } from '@/lib/notify';
import { Header } from '@/components/layout/Header';
import { HomeOverview } from '@/components/features/HomeOverview';
import { HomeTabs } from '@/components/features/HomeTabs';
import { ExpandableFab } from '@/components/features/ExpandableFab';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';
import { Avatar } from '@/components/ui/Avatar';
import { Balance } from '@/components/ui/Balance';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { AddFriendSheet } from '@/components/features/AddFriendSheet';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function PeoplePage() {
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();
    const { ready: syncReady } = useSyncStatus();
    const people = usePeopleBalances(user?.id);
    const friendships = useFriendships(user?.id);
    const [showAddFriend, setShowAddFriend] = useState(false);
    const [respondingId, setRespondingId] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const relatedUserIds = useMemo(() => {
        if (!friendships) return new Set<string>();
        return new Set([
            ...friendships.accepted.map((f) => (f.user_a === user?.id ? f.user_b : f.user_a)),
            ...friendships.incoming.map((f) => (f.user_a === user?.id ? f.user_b : f.user_a)),
            ...friendships.outgoing.map((f) => (f.user_a === user?.id ? f.user_b : f.user_a)),
        ]);
    }, [friendships, user]);

    const handleAccept = async (friendshipId: string) => {
        setRespondingId(friendshipId);
        try {
            const updated = await friendshipsApi.accept(friendshipId);
            await db.friendships.put(updated);
            notifyEvent('friend.accepted', updated.id);
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao aceitar'), 'error');
        } finally {
            setRespondingId(null);
        }
    };

    const handleDecline = async (friendshipId: string) => {
        setRespondingId(friendshipId);
        try {
            await friendshipsApi.remove(friendshipId);
            await db.friendships.delete(friendshipId);
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao recusar'), 'error');
        } finally {
            setRespondingId(null);
        }
    };

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

            <HomeOverview />
            <main className="container mx-auto max-w-lg px-2 sm:px-4 pt-5 pb-24">
                <HomeTabs />

                {friendships && friendships.incoming.length > 0 && (
                    <div className="mb-6 animate-fade-in-up">
                        <h3 className="text-xs font-bold text-ink-faint uppercase tracking-wide mb-2">Pedidos de amizade</h3>
                        <div className="card divide-y divide-hairline overflow-hidden">
                            {friendships.incoming.map((f) => {
                                const other = f.user_a === user?.id ? f.expand?.user_b : f.expand?.user_a;
                                const otherId = f.user_a === user?.id ? f.user_b : f.user_a;
                                return (
                                    <div key={f.id} className="flex items-center gap-2 px-4 py-3">
                                        <Avatar name={other?.name ?? 'Alguém'} src={getUserAvatarUrl(otherId, other?.avatar)} size="sm" />
                                        <span className="flex-1 min-w-0 font-medium text-ink truncate">{other?.name ?? 'Alguém'}</span>
                                        <button
                                            type="button"
                                            disabled={respondingId === f.id}
                                            onClick={() => handleDecline(f.id)}
                                            aria-label="Recusar pedido"
                                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-surface-sunken text-ink-soft disabled:opacity-50"
                                        >
                                            <Icon name="close" className="text-lg" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={respondingId === f.id}
                                            onClick={() => handleAccept(f.id)}
                                            aria-label="Aceitar pedido"
                                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-primary-600 text-white disabled:opacity-50"
                                        >
                                            <Icon name="check" className="text-lg" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Lista vazia antes da 1.ª sincronização = ainda a carregar, não "sem saldos". */}
                {!people || (people.length === 0 && !syncReady) ? (
                    <ListSkeleton rows={4} leading="person" />
                ) : people.length === 0 ? (
                    <div className="text-center py-20 px-4">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary-50 dark:bg-primary-950 text-primary-500 flex items-center justify-center">
                            <Icon name="group" className="text-5xl" />
                        </div>
                        <h3 className="text-xl font-semibold text-ink mb-2">Sem saldos por agora</h3>
                        <p className="text-ink-soft mb-6 max-w-sm mx-auto">Assim que partilhares uma despesa nos teus grupos, os saldos com cada pessoa aparecem aqui.</p>
                        <Button onClick={() => nav.push('/groups', { haptic: false })}>
                            <Icon name="groups" className="text-xl" />
                            Ver grupos
                        </Button>
                    </div>
                ) : (
                    <div className="card divide-y divide-hairline overflow-hidden">
                        {people.map((person) => (
                                <button
                                    key={person.userId}
                                    type="button"
                                    onClick={() => nav.push(`/people/${person.userId}`, { haptic: false })}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
                                >
                                    <Avatar name={person.party.name} src={person.party.avatar} size="sm" />
                                    <span className="flex-1 min-w-0 font-medium text-ink truncate">{person.party.name}</span>
                                    <Balance
                                        cents={person.netCents}
                                        labels={{ pos: 'deve-te', neg: 'deves' }}
                                        settledLabel="Contas em dia"
                                    />
                                    <Icon name="chevron_right" className="text-ink-faint" />
                                </button>
                        ))}
                    </div>
                )}
            </main>

            <ExpandableFab icon="person_add" label="Adicionar Amigo" onClick={() => setShowAddFriend(true)} />
            <GlobalBottomNav />

            {user?.id && (
                <AddFriendSheet
                    isOpen={showAddFriend}
                    onClose={() => setShowAddFriend(false)}
                    currentUserId={user.id}
                    isAlreadyRelated={(userId) => relatedUserIds.has(userId)}
                    onRequested={() => {}}
                />
            )}
        </div>
    );
}
