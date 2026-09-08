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
import { useRefreshHandler } from '@/context/RefreshContext';

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('👥');
    const [creating, setCreating] = useState(false);

    const { user, isLoggedIn } = useUser();
    const { setCurrentGroup } = useGroup();
    const { showToast } = useToast();
    const router = useRouter();

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

    const loadGroups = async () => {
        if (!user?.id) return;
        try {
            const data = await groupsApi.getByUser(user.id);
            setGroups(data);
        } catch (error) {
            console.error('Error loading groups:', error);
            showToast('Erro ao carregar grupos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.id) {
            loadGroups();
        }
    }, [user?.id]);

    useRefreshHandler(loadGroups);

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            showToast('O nome do grupo é obrigatório', 'error');
            return;
        }

        setCreating(true);
        try {
            // Convert emoji to image
            const avatarBlob = await emojiToImageBlob(selectedEmoji);

            const newGroup = await groupsApi.create({
                name: newGroupName.trim(),
                avatar: avatarBlob,
            });
            setGroups(prev => [newGroup, ...prev]);
            setShowCreateModal(false);
            setNewGroupName('');
            setSelectedEmoji('👥');
            showToast('Grupo criado com sucesso!', 'success');
        } catch (error: any) {
            console.error('Error creating group:', error);
            if (error?.data) console.error('Error Data:', JSON.stringify(error.data, null, 2));

            // PocketBase error details
            const details = error?.data?.data
                ? Object.entries(error.data.data).map(([k, v]: [string, any]) => `${k}: ${v.message}`).join(', ')
                : error.message;

            showToast(`Erro ao criar grupo: ${details}`, 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleSelectGroup = (group: Group) => {
        setCurrentGroup(group);
        router.push(`/groups/${group.id}/trips`);
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
                        Olá, <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{user?.name || 'amigo'}</span>! 👋
                    </h2>
                    <p className="text-[var(--text-secondary)]">Seleciona um grupo ou cria um novo</p>
                </div>

                {/* Loading */}
                {loading ? (
                    <EntityCardSkeletonGrid count={3} />
                ) : (
                    <>
                        {/* Create Group Button */}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="w-full mb-6 p-4 border-2 border-dashed border-violet-300 rounded-2xl text-violet-600 font-semibold hover:bg-violet-50 hover:border-violet-400 transition-all flex items-center justify-center gap-2 animate-fade-in-up"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Criar Novo Grupo
                        </button>

                        {groups.length === 0 ? (
                            /* Empty State */
                            <div className="text-center py-20 animate-fade-in-up">
                                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
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
                    <button
                        onClick={handleCreateGroup}
                        disabled={creating || !newGroupName.trim()}
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
                }
            >
                <div className="space-y-6 pb-4">
                    {/* Group Name */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                            Nome do Grupo
                        </label>
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Ex: Família, Amigos, Trabalho..."
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-lg dark:text-white dark:placeholder:text-gray-500"
                            autoFocus
                        />
                    </div>

                    {/* Emoji Picker */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
                            Ícone do Grupo
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {GROUP_EMOJIS.map((emoji) => (
                                <button
                                    key={emoji}
                                    onClick={() => setSelectedEmoji(emoji)}
                                    className={cn(
                                        'w-14 h-14 rounded-2xl text-3xl transition-all flex items-center justify-center',
                                        selectedEmoji === emoji
                                            ? 'bg-violet-100 dark:bg-violet-900/40 ring-4 ring-violet-500/20 dark:ring-violet-500/40 scale-110 shadow-sm'
                                            : 'bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-700'
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
