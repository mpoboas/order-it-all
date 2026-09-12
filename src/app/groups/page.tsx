'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useToast } from '@/context/ToastContext';
import { groupsApi } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { EntityCardSkeletonGrid } from '@/components/ui/EntityCardSkeleton';
import { GROUP_EMOJIS } from '@/lib/groupAvatars';
import { cn, emojiToImageBlob } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { GroupCard } from '@/components/features/GroupCard';
import { NotificationSoftAsk } from '@/components/features/NotificationSoftAsk';
import { Icon } from '@/components/ui/Icon';
import { useGroups } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { onlineCreate, mutationErrorMessage } from '@/lib/db/mutations';
import { useSyncStatus } from '@/context/SyncProvider';
import { useOnline } from '@/hooks/useOnline';
import { useAppNavigate } from '@/hooks/useAppNavigate';

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

    // Redirect if not logged in
    useEffect(() => {
        if (!isLoggedIn) {
            router.push('/');
        }
    }, [isLoggedIn, router]);

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
        const isGroupAdmin = !!user?.id && group.admins?.includes(user.id);
        nav.push(`/groups/${group.id}/${isGroupAdmin ? 'admin' : 'trips'}`, { haptic: false });
    };

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            <Header
                title="Meus Grupos"
                subtitle="Escolhe um grupo para começar"
                icon={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src="/favicon.svg"
                        alt=""
                        className="w-full h-full object-contain p-1"
                    />
                }
            />

            <main className="container mx-auto px-4 py-6 md:py-8">
                {/* Greeting */}
                <div className="mb-8 animate-fade-in-up">
                    <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-1">
                        Olá, <span className="bg-gradient-to-r from-primary-600 to-primary-600 bg-clip-text text-transparent">{user?.name || 'amigo'}</span>! 👋
                    </h2>
                    <p className="text-[var(--text-secondary)]">Seleciona um grupo ou cria um novo</p>
                </div>

                <div className="mb-6">
                    <NotificationSoftAsk />
                </div>

                {/* Loading */}
                {loading ? (
                    <EntityCardSkeletonGrid count={3} />
                ) : (
                    <>
                        {/* Create Group Button */}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="w-full mb-6 p-4 border-2 border-dashed border-primary-300 dark:border-primary-800 rounded-2xl text-info-fg font-semibold hover:bg-info-bg hover:border-primary-400 dark:hover:border-primary-600 transition flex items-center justify-center gap-2 animate-fade-in-up"
                        >
                            <Icon name="add" className="text-xl" />
                            Criar Novo Grupo
                        </button>

                        {groups.length === 0 ? (
                            /* Empty State */
                            <div className="text-center py-20 animate-fade-in-up">
                                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-100 to-primary-100 flex items-center justify-center">
                                    <span className="text-6xl">👥</span>
                                </div>
                                <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                                    Sem grupos ainda
                                </h3>
                                <p className="text-[var(--text-secondary)] mb-6 max-w-sm mx-auto">
                                    Cria um grupo para começar a organizar compras e divisões!
                                </p>
                            </div>
                        ) : (
                            /* Groups Grid */
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {groups.map((group, index) => (
                                    <GroupCard
                                        key={group.id}
                                        group={group}
                                        userId={user?.id}
                                        onSelect={() => handleSelectGroup(group)}
                                        style={{ animationDelay: `${index * 0.05}s` }}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>


            {/* Create Group Sheet */}
            <Sheet
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                size="medium"
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
                            <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
                                Sem ligação — precisas de rede para criar um grupo.
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
        </div>
    );
}
