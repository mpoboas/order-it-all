'use client';

import { ListSkeleton } from '@/components/ui/ListSkeleton';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useToast } from '@/context/ToastContext';
import { groupsApi } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { GROUP_EMOJIS } from '@/lib/groupAvatars';
import { cn, emojiToImageBlob } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { GroupCard } from '@/components/features/GroupCard';
import { HomeOverview } from '@/components/features/HomeOverview';
import { HomeTabs } from '@/components/features/HomeTabs';
import { ExpandableFab } from '@/components/features/ExpandableFab';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';
import { NotificationInstallPrompt } from '@/components/features/NotificationInstallPrompt';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useGroups, useGroupBalances } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { onlineCreate, mutationErrorMessage } from '@/lib/db/mutations';
import { markInstallValueMoment } from '@/lib/installValueMoment';
import { shouldShowNotificationPrompt } from '@/lib/notificationPromptState';
import { useSyncStatus } from '@/context/SyncProvider';
import { useOnline } from '@/hooks/useOnline';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { groupHomeHref } from '@/lib/navHierarchy';

/** Quanto tempo um grupo novo fica na lista mesmo com as contas em dia. */
const RECENT_GROUP_MS = 7 * 24 * 60 * 60 * 1000;

export default function GroupsPage() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('👥');
    const [creating, setCreating] = useState(false);

    const { user, isLoggedIn } = useUser();
    const { setCurrentGroup } = useGroup();
    const { showToast } = useToast();
    const router = useRouter();
    const nav = useAppNavigate();
    const online = useOnline();

    const groupsQuery = useGroups(user?.id);
    const groups = groupsQuery ?? [];
    const { hydrating } = useSyncStatus();
    const loading = groupsQuery === undefined || (groups.length === 0 && hydrating);
    const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
    const balances = useGroupBalances(user?.id);
    const [showSettled, setShowSettled] = useState(false);

    // Um grupo fica na lista enquanto não estiver em dia OU nos primeiros 7
    // dias depois de criado — um grupo acabado de criar tem saldo zero e ia
    // logo parar a "Mostrar N grupos em dia", como se já estivesse arrumado.
    const isRecent = (g: { created: string }) => Date.now() - new Date(g.created).getTime() < RECENT_GROUP_MS;
    const isSettled = (g: { id: string }) => Math.abs(balances?.get(g.id) ?? 0) < 1;
    const settledGroups = groups.filter((g) => isSettled(g) && !isRecent(g));
    const activeGroups = groups.filter((g) => !isSettled(g) || isRecent(g));
    const visibleGroups = showSettled ? groups : activeGroups;

    // Redirect if not logged in
    useEffect(() => {
        if (!isLoggedIn) {
            router.push('/');
        }
    }, [isLoggedIn, router]);

    // Utilizadores antigos (de antes do onboarding existir) têm
    // `onboarded` a false/undefined — mostra-lho da próxima vez que abrirem
    // a app, não só a quem acabou de criar conta (ver memória
    // `onboarding-pwa-install`).
    useEffect(() => {
        if (isLoggedIn && user && !user.onboarded) {
            router.push('/onboarding');
        }
    }, [isLoggedIn, user, router]);

    // Pedido de ativar notificações — apanha quem acabou de instalar a WPA
    // e voltou a entrar na app, ou quem criou o primeiro grupo/viagem sem
    // alguma vez ter feito um pedido (esse caso, com o item real, dispara
    // logo em `trips/[tripId]/page.tsx`).
    useEffect(() => {
        if (isLoggedIn && shouldShowNotificationPrompt(true)) {
            setShowNotificationPrompt(true);
        }
    }, [isLoggedIn]);

    // Clear current group when visiting groups list
    useEffect(() => {
        setCurrentGroup(null);
    }, [setCurrentGroup]);

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            showToast('O nome do grupo é obrigatório', 'error');
            return;
        }

        setCreating(true);
        try {
            const avatarBlob = await emojiToImageBlob(selectedEmoji);

            await onlineCreate(() =>
                groupsApi.create({ name: newGroupName.trim(), avatar: avatarBlob }),
            );
            markInstallValueMoment();
            void catchUp();
            setShowCreateModal(false);
            setNewGroupName('');
            setSelectedEmoji('👥');
        } catch (error) {
            console.error('Error creating group:', error);
            showToast(mutationErrorMessage(error, 'Erro ao criar grupo'), 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleSelectGroup = (group: Group) => {
        setCurrentGroup(group);
        nav.push(groupHomeHref(group.id), { haptic: false });
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

                {/* Loading */}
                {loading ? (
                    <ListSkeleton rows={3} leading="group" />
                ) : (
                    <>
                        {groups.length === 0 ? (
                            /* Estado vazio — onboarding: primeira ação acionável, não só texto
                               (ver plano de onboarding). */
                            <div className="text-center py-20 animate-fade-in-up">
                                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center">
                                    <span className="text-6xl">👥</span>
                                </div>
                                <h3 className="text-xl font-semibold text-ink mb-2">
                                    Cria o teu primeiro grupo
                                </h3>
                                <p className="text-ink-soft mb-6 max-w-sm mx-auto">
                                    Convida amigos ou família e organiza compras e despesas em conjunto.
                                </p>
                                <Button onClick={() => setShowCreateModal(true)}>
                                    <Icon name="add" className="text-xl" />
                                    Criar Grupo
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="card divide-y divide-hairline overflow-hidden">
                                    {visibleGroups.map((group) => (
                                        <GroupCard
                                            key={group.id}
                                            group={group}
                                            netCents={balances?.get(group.id)}
                                            onSelect={() => handleSelectGroup(group)}
                                        />
                                    ))}
                                </div>

                                {!showSettled && settledGroups.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowSettled(true)}
                                        className="w-full mt-4 py-2.5 rounded-full border border-hairline-strong text-sm font-semibold text-ink-soft hover:bg-surface-sunken transition-colors"
                                    >
                                        Mostrar {settledGroups.length} {settledGroups.length === 1 ? 'grupo em dia' : 'grupos em dia'}
                                    </button>
                                )}
                                {showSettled && (
                                    <button
                                        type="button"
                                        onClick={() => setShowSettled(false)}
                                        className="w-full mt-4 py-2.5 rounded-full border border-hairline-strong text-sm font-semibold text-ink-soft hover:bg-surface-sunken transition-colors"
                                    >
                                        Ocultar grupos em dia
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>


            {/* Create Group Sheet */}
            <Sheet
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                size="full"
                title="Criar Novo Grupo"
                footer={
                    <div>
                        <button
                            onClick={handleCreateGroup}
                            disabled={creating || !newGroupName.trim() || !online}
                            className="w-full py-4 text-lg font-semibold btn btn-primary flex items-center justify-center gap-2"
                        >
                            {creating ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    A criar...
                                </>
                            ) : (
                                'Criar Grupo'
                            )}
                        </button>
                        {!online && (
                            <p className="mt-2 text-center text-xs text-ink-faint">
                                Sem ligação. Precisas de rede para criar um grupo.
                            </p>
                        )}
                    </div>
                }
            >
                <div className="space-y-6 pb-4">
                    {/* Group Name */}
                    <div>
                        <label className="block text-sm font-bold text-ink mb-2">
                            Nome do Grupo
                        </label>
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Ex: Família, Amigos, Trabalho..."
                            className="w-full px-4 py-3 rounded-xl border-2 border-hairline focus:border-primary-500 focus:ring-0 transition-colors bg-surface-sunken focus:bg-surface text-lg text-ink"
                            autoFocus
                        />
                    </div>

                    {/* Emoji Picker */}
                    <div>
                        <label className="block text-sm font-bold text-ink mb-3">
                            Ícone do Grupo
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {GROUP_EMOJIS.map((emoji) => (
                                <button
                                    key={emoji}
                                    onClick={() => setSelectedEmoji(emoji)}
                                    className={cn(
                                        'w-14 h-14 rounded-2xl text-3xl transition flex items-center justify-center',
                                        selectedEmoji === emoji
                                            ? 'bg-primary-100 dark:bg-primary-900/40 ring-4 ring-primary-500/20 dark:ring-primary-500/40 scale-110 shadow-sm'
                                            : 'bg-surface-sunken hover:bg-hairline-strong border border-hairline'
                                    )}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Sheet>

            {showNotificationPrompt && (
                <NotificationInstallPrompt onClose={() => setShowNotificationPrompt(false)} />
            )}
            <ExpandableFab icon="add" label="Criar Grupo" onClick={() => setShowCreateModal(true)} />
            <GlobalBottomNav />
        </div>
    );
}
