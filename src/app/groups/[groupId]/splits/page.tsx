'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useToast } from '@/context/ToastContext';
import { splitsApi } from '@/lib/pocketbase';
import type { Split } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { SplitCard } from '@/components/features/SplitCard';
import { SplitFormSheet } from '@/components/features/SplitFormSheet';
import { collectGroupMembers } from '@/lib/splitShare';
import { useSplits } from '@/lib/db/hooks';
import { db } from '@/lib/db/schema';
import { optimisticEdit, optimisticDelete, mutationErrorMessage } from '@/lib/db/mutations';
import { useSyncStatus } from '@/context/SyncProvider';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function GroupSplitsPage() {
    const [showCreate, setShowCreate] = useState(false);
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
    const nav = useAppNavigate();

    const userName = user?.name || user?.email || '';

    const splitsQuery = useSplits(groupId);
    const splits = splitsQuery ?? [];
    const { groupSyncing } = useSyncStatus();
    const loading = splitsQuery === undefined || (splits.length === 0 && groupSyncing);

    const displayedSplits = splits.filter(split =>
        isAdmin ||
        split.created_by === user?.id ||
        split.participants.includes(userName)
    );
    usePrefetchRoutes(displayedSplits.map((s) => `/groups/${groupId}/splits/${s.id}`));

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const groupMembers = collectGroupMembers(currentGroup);

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
        const patch = { name: editName.trim(), description: editDesc.trim() };
        try {
            await optimisticEdit({
                table: db.splits,
                id: editingSplit.id,
                patch,
                commit: () => splitsApi.update(editingSplit.id, patch),
            });
            showToast('Divisão atualizada!', 'success');
            closeEdit();
        } catch (error) {
            console.error('Error updating split:', error);
            showToast(mutationErrorMessage(error, 'Erro ao guardar divisão'), 'error');
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Eliminar esta divisão?')) return;
        try {
            await optimisticDelete({
                table: db.splits,
                id,
                commit: () => splitsApi.delete(id),
            });
            showToast('Divisão eliminada!', 'success');
        } catch (error) {
            console.error('Error deleting split:', error);
            showToast(mutationErrorMessage(error, 'Erro ao eliminar'), 'error');
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
                                href={`/groups/${groupId}/splits/${split.id}`}
                                onOpen={() => nav.push(`/groups/${groupId}/splits/${split.id}`, { haptic: false })}
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

            {/* Create Split Wizard */}
            <SplitFormSheet
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                onCreated={(newSplit) => {
                    setShowCreate(false);
                    nav.push(`/groups/${groupId}/splits/${newSplit.id}`, { haptic: false });
                }}
                groupId={groupId}
                groupMembers={groupMembers}
                currentUserId={user?.id || ''}
                currentUserName={userName}
            />
        </div>
    );
}
