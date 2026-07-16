'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useToast } from '@/context/ToastContext';
import { splitsApi, subscriptions } from '@/lib/pocketbase';
import type { Split } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { SplitCard } from '@/components/features/SplitCard';
import { normalizeSplitRecord } from '@/lib/splitStatus';
import {
    collectGroupMembers,
    collectGroupParticipantNames,
    participantDisplayName,
} from '@/lib/splitShare';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { Avatar } from '@/components/ui/Avatar';

export default function GroupSplitsPage() {
    const [splits, setSplits] = useState<Split[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [includeAllMembers, setIncludeAllMembers] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [editingSplit, setEditingSplit] = useState<Split | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editSubmitting, setEditSubmitting] = useState(false);

    const params = useParams();
    const groupId = params.groupId as string;

    const { user, isLoggedIn } = useUser();
    const { currentGroup, isAdmin } = useGroup();
    const { showToast } = useToast();
    const router = useRouter();

    const userName = user?.name || user?.email || '';

    const displayedSplits = splits.filter(split =>
        isAdmin ||
        split.created_by === user?.id ||
        split.participants.includes(userName)
    );

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const loadSplits = useCallback(async () => {
        if (!groupId) return;
        try {
            const data = await splitsApi.getByGroup(groupId);
            setSplits(data.map(normalizeSplitRecord));
        } catch (error) {
            console.error('Error loading splits:', error);
            showToast('Erro ao carregar divisões', 'error');
        } finally {
            setLoading(false);
        }
    }, [groupId, showToast]);

    useEffect(() => {
        loadSplits();
        subscriptions.subscribeToSplits(() => loadSplits());
        return () => subscriptions.unsubscribeAll();
    }, [loadSplits]);

    const groupMemberCount = collectGroupParticipantNames(currentGroup).length;
    const groupMembers = collectGroupMembers(currentGroup);

    const closeCreate = () => {
        setShowCreate(false);
        setNewName('');
        setNewDesc('');
        setIncludeAllMembers(true);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setSubmitting(true);
        try {
            const creatorName = user?.name || user?.email || 'User';
            const groupParticipants = collectGroupParticipantNames(currentGroup);
            let participants = includeAllMembers && groupParticipants.length > 0
                ? groupParticipants
                : [creatorName];

            if (!participants.some((p) => p.toLowerCase() === creatorName.toLowerCase())) {
                participants = [creatorName, ...participants];
            }

            const newSplit = await splitsApi.create({
                name: newName.trim(),
                description: newDesc.trim(),
                group_id: groupId,
                created_by: user!.id,
                participants,
                items: [],
            });
            showToast('Divisão criada!', 'success');
            closeCreate();
            router.push(`/groups/${groupId}/splits/${newSplit.id}`);
        } catch (error) {
            console.error('Error creating split:', error);
            showToast('Erro ao criar divisão', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const canManageSplit = (split: Split) =>
        isAdmin || split.created_by === user?.id;

    const openEdit = (split: Split, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingSplit(split);
        setEditName(split.name.replace(/^Divisão:\s*/i, '').trim() || split.name);
        setEditDesc(split.description || '');
    };

    const closeEdit = () => {
        setEditingSplit(null);
        setEditName('');
        setEditDesc('');
    };

    const handleEdit = async () => {
        if (!editingSplit || !editName.trim()) return;

        setEditSubmitting(true);
        try {
            await splitsApi.update(editingSplit.id, {
                name: editName.trim(),
                description: editDesc.trim(),
            });
            showToast('Divisão atualizada!', 'success');
            closeEdit();
            loadSplits();
        } catch (error) {
            console.error('Error updating split:', error);
            showToast('Erro ao guardar divisão', 'error');
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Eliminar esta divisão?')) return;
        try {
            await splitsApi.delete(id);
            showToast('Divisão eliminada!', 'success');
            loadSplits();
        } catch (error) {
            console.error('Error deleting split:', error);
            showToast('Erro ao eliminar', 'error');
        }
    };

    const getTotalAmount = (split: Split) => split.items?.reduce((sum, item) => sum + item.price, 0) || 0;

    if (!isLoggedIn) return null;

    return (
        <div
            className={cn(
                'min-h-screen bg-[var(--bg-primary)] overflow-x-hidden',
                isAdmin && 'has-bottom-nav'
            )}
        >
            <Header
                title={currentGroup?.name || 'Divisões'}
                subtitle="Divide despesas com o grupo"
                showBack
                groupId={groupId}
            />

            <main className="container mx-auto px-4 py-6 max-w-6xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 animate-fade-in-up">
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Divisões</h2>
                        <p className="text-sm text-[var(--text-secondary)]">Divide despesas de forma justa</p>
                    </div>
                    <button onClick={() => setShowCreate(true)} className="btn btn-primary px-4 py-2 w-full sm:w-auto">
                        + Nova Divisão
                    </button>
                </div>



                {/* Loading */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : displayedSplits.length === 0 && !showCreate ? (
                    <div className="text-center py-20 animate-fade-in-up">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/30 dark:to-emerald-900/30 flex items-center justify-center">
                            <span className="text-5xl">🧮</span>
                        </div>
                        <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Sem divisões</h3>
                        <p className="text-[var(--text-secondary)] mb-6">Cria uma para dividir despesas do grupo!</p>
                        <button onClick={() => setShowCreate(true)} className="btn btn-primary px-6 py-3">
                            Criar Divisão
                        </button>
                    </div>
                ) : (
                    /* Splits Grid */
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {displayedSplits.map((split, idx) => (
                            <SplitCard
                                key={split.id}
                                split={split}
                                total={getTotalAmount(split)}
                                canEdit={canManageSplit(split)}
                                canDelete={canManageSplit(split)}
                                showSplitwise={isAdmin}
                                onOpen={() => router.push(`/groups/${groupId}/splits/${split.id}`)}
                                onEdit={(e) => openEdit(split, e)}
                                onDelete={(e) => handleDelete(split.id, e)}
                                style={{ animationDelay: `${idx * 0.05}s` }}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Edit Split Sheet */}
            <Sheet
                isOpen={Boolean(editingSplit)}
                onClose={closeEdit}
                size="medium"
                title="Editar divisão"
                footer={
                    <button
                        type="submit"
                        form="edit-split-form"
                        disabled={editSubmitting || !editName.trim()}
                        className="w-full py-4 text-lg font-semibold btn btn-primary"
                    >
                        {editSubmitting ? 'A guardar...' : 'Guardar'}
                    </button>
                }
            >
                <form
                    id="edit-split-form"
                    className="space-y-6 pb-4"
                    onSubmit={e => {
                        e.preventDefault();
                        void handleEdit();
                    }}
                >
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                            Nome
                        </label>
                        <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="ex. Jantar de Grupo"
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-lg dark:text-white"
                            autoFocus
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                            Descrição (opcional)
                        </label>
                        <textarea
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            placeholder="Adiciona detalhes sobre o que está a ser dividido..."
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 resize-none dark:text-white"
                        />
                    </div>
                </form>
            </Sheet>

            {/* Create Split Sheet */}
            <Sheet
                isOpen={showCreate}
                onClose={closeCreate}
                size="medium"
                title="Nova Divisão"
                footer={
                    <button
                        onClick={handleCreate}
                        disabled={submitting || !newName.trim()}
                        className="w-full py-4 text-lg font-semibold btn btn-primary"
                    >
                        {submitting ? 'A criar...' : 'Criar Divisão'}
                    </button>
                }
            >
                <div className="space-y-6 pb-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Nome da Divisão</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="ex. Jantar de Grupo"
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-lg dark:text-white"
                            autoFocus
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Descrição (opcional)</label>
                        <textarea
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                            placeholder="Adiciona detalhes sobre o que está a ser dividido..."
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 resize-none dark:text-white"
                        />
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-3">
                        <input
                            type="checkbox"
                            checked={includeAllMembers}
                            onChange={e => setIncludeAllMembers(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">
                                Incluir todos os membros do grupo
                            </span>
                            <span className="block text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                {groupMemberCount > 0
                                    ? `Adiciona ${groupMemberCount} participante${groupMemberCount === 1 ? '' : 's'} à divisão.`
                                    : 'Só ficas tu como participante (membros do grupo ainda não carregados).'}
                            </span>
                        </span>
                    </label>
                    {includeAllMembers && groupMembers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {groupMembers.map((member) => {
                                const name = participantDisplayName(member);
                                return (
                                    <span
                                        key={member.id}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-gray-800 dark:text-gray-200"
                                    >
                                        <Avatar
                                            name={name}
                                            src={getUserAvatarUrl(member.id, member.avatar)}
                                            size="xs"
                                        />
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Sheet>
        </div>
    );
}
