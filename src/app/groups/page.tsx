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
import { cn, emojiToImageBlob } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';

// Available emojis for group avatars
const GROUP_EMOJIS = ['👥', '🏠', '🏡', '🏢', '👨‍👩‍👧‍👦', '🎉', '⚽', '🍻', '🍕', '✈️', '🛒', '🎮', '📚', '💼'];

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
            <Header title="Meus Grupos" subtitle="Escolhe um grupo para começar" icon="🫐" />

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
                    <div className="flex flex-col items-center justify-center py-20">
                        <LoadingSpinner size="lg" />
                        <p className="text-[var(--text-muted)] mt-4 animate-pulse-soft">A carregar grupos...</p>
                    </div>
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
                                    <button
                                        key={group.id}
                                        onClick={() => handleSelectGroup(group)}
                                        className={cn(
                                            'card card-hover p-5 text-left w-full group',
                                            'animate-fade-in-up',
                                            'active:scale-[0.98] transition-transform'
                                        )}
                                        style={{ animationDelay: `${index * 0.05}s` }}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Avatar */}
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                {group.avatar && group.avatar.length > 2 ? (
                                                    <img src={`https://pb-orderit.povoas.top/api/files/groups/${group.id}/${group.avatar}`} alt="Group" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-2xl">{group.avatar || '👥'}</span>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate group-hover:text-violet-600 transition-colors">
                                                    {group.name}
                                                </h3>
                                                <p className="text-sm text-[var(--text-secondary)]">
                                                    {group.members?.length || 1} membro{(group.members?.length || 1) !== 1 ? 's' : ''}
                                                </p>
                                            </div>

                                            {/* Arrow */}
                                            <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-violet-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>

                                        {/* Role Badge */}
                                        {group.creator === user?.id && (
                                            <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                    </svg>
                                                    Criador
                                                </span>
                                            </div>
                                        )}
                                        {group.creator !== user?.id && group.admins?.includes(user?.id || '') && (
                                            <div className="mt-3 pt-3 border-t border-[var(--border)]">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                                                    </svg>
                                                    Admin
                                                </span>
                                            </div>
                                        )}
                                    </button>
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
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                            Nome do Grupo
                        </label>
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Ex: Família, Amigos, Trabalho..."
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 focus:bg-white text-lg"
                            autoFocus
                        />
                    </div>

                    {/* Emoji Picker */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-3">
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
                                            ? 'bg-violet-100 ring-4 ring-violet-500/20 scale-110 shadow-sm'
                                            : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'
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
