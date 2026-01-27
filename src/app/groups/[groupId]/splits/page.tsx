'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useToast } from '@/context/ToastContext';
import { splitsApi, subscriptions } from '@/lib/pocketbase';
import type { Split } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { getRelativeTime, formatCurrency, cn } from '@/lib/utils';
import { Sheet } from '@/components/ui/Sheet';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

export default function GroupSplitsPage() {
    const [splits, setSplits] = useState<Split[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);

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
            setSplits(data);
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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setSubmitting(true);
        try {
            const userName = user?.name || user?.email || 'User';
            const newSplit = await splitsApi.create({
                name: newName.trim(),
                description: newDesc.trim(),
                group_id: groupId,
                created_by: user!.id,
                participants: [userName], // Initial participant is creator
                items: [],
            });
            showToast('Divisão criada!', 'success');
            setShowCreate(false);
            setNewName('');
            setNewDesc('');
            router.push(`/groups/${groupId}/splits/${newSplit.id}`);
        } catch (error) {
            console.error('Error creating split:', error);
            showToast('Erro ao criar divisão', 'error');
        } finally {
            setSubmitting(false);
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
        <div className="min-h-screen bg-[var(--bg-primary)] has-bottom-nav overflow-x-hidden">
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
                        <button onClick={() => setShowCreate(true)} className="btn btn-accent px-6 py-3">
                            Criar Divisão
                        </button>
                    </div>
                ) : (
                    /* Splits Grid */
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {displayedSplits.map((split, idx) => {
                            const total = getTotalAmount(split);
                            return (
                                <div
                                    key={split.id}
                                    className="card p-5 animate-fade-in-up cursor-pointer group hover:ring-2 hover:ring-violet-300 dark:hover:ring-violet-700 transition-all"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                    onClick={() => router.push(`/groups/${groupId}/splits/${split.id}`)}
                                >
                                    {/* Header */}
                                    <div className="flex justify-between items-start gap-3 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                                {split.name}
                                            </h3>
                                            <p className="text-sm text-[var(--text-secondary)] truncate">
                                                {split.description || 'Sem descrição'}
                                            </p>
                                        </div>
                                        <span className="flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full text-sm font-medium">
                                            {split.participants.length} 👤
                                        </span>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex justify-between items-end">
                                        <div className="text-xs text-[var(--text-muted)]">
                                            <p>{split.items?.length || 0} {(split.items?.length || 0) === 1 ? 'item' : 'itens'}</p>
                                            <p className="flex items-center gap-1 mt-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {getRelativeTime(split.created)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{formatCurrency(total)}</p>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border)]">
                                        <button
                                            onClick={(e) => handleDelete(split.id, e)}
                                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                        <span className="text-violet-600 dark:text-violet-400 font-medium text-sm group-hover:translate-x-1 transition-transform flex items-center">
                                            Abrir
                                            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Create Split Sheet */}
            <Sheet
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
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
                </div>
            </Sheet>
        </div>
    );
}
