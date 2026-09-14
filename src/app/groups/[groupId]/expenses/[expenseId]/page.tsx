'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSmartRouter } from '@/hooks/useSmartRouter';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useExpense, useParties } from '@/lib/db/hooks';
import { expensesApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { mutationErrorMessage } from '@/lib/db/mutations';
import { notify, notifiableUserIds } from '@/lib/notify';
import { partyLabel } from '@/lib/parties';
import { formatEUR } from '@/lib/money';
import { CommentsBar } from '@/components/features/CommentsBar';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Button } from '@/components/ui/Button';
import { ShareTree } from '@/components/features/ShareTree';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { formatRelativeOrDate } from '@/lib/utils';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function ExpenseDetailPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const expenseId = params.expenseId as string;
    const router = useSmartRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();
    const confirmAction = useConfirm();

    const expense = useExpense(expenseId);
    const parties = useParties(groupId);
    const loading = expense === undefined || parties === undefined;

    const [showEdit, setShowEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const handleDelete = async () => {
        if (!expense || !user?.id) return;
        if (!(await confirmAction({
            title: 'Eliminar esta despesa?',
            tone: 'danger',
            confirmLabel: 'Eliminar',
        }))) return;
        setDeleting(true);
        try {
            const updated = await expensesApi.softDelete(expense.id, user.id);
            await db.expenses.put(updated);
            showToast('Despesa eliminada', 'success');

            if (parties) {
                const participantIds = Array.from(
                    new Set([...updated.payers.map((p) => p.party), ...updated.shares.map((s) => s.party)]),
                );
                void notify({
                    targetUserIds: notifiableUserIds(participantIds, parties, user.id),
                    title: '🗑️ Despesa eliminada',
                    message: `${partyLabel(user.id, parties)} eliminou "${updated.description}" — ${formatEUR(updated.amount)}.`,
                    url: `/groups/${groupId}/expenses`,
                });
            }

            nav.up();
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao eliminar despesa'), 'error');
        } finally {
            setDeleting(false);
        }
    };

    if (!isLoggedIn) return null;

    if (loading) {
        return (
            <div className="min-h-dvh bg-app">
                <Header title="Detalhes" showBack groupId={groupId} />
                <div className="flex justify-center py-20">
                    <LoadingSpinner size="lg" />
                </div>
            </div>
        );
    }

    if (!expense) {
        return (
            <div className="min-h-dvh bg-app">
                <Header title="Detalhes" showBack groupId={groupId} />
                <div className="text-center py-20 px-4">
                    <p className="text-ink-soft">Despesa não encontrada.</p>
                </div>
            </div>
        );
    }

    const addedBy = expense.expand?.created_by?.name || 'alguém';
    const updatedBy = expense.expand?.updated_by?.name;
    const wasEdited = expense.updated_by && expense.updated_by !== expense.created_by;

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            <Header
                title="Detalhes"
                showBack
                groupId={groupId}
                actions={
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={handleDelete} disabled={deleting} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/20 text-white/90" aria-label="Eliminar despesa">
                            <Icon name="delete_outline" className="text-lg" />
                        </button>
                        <button type="button" onClick={() => setShowEdit(true)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/20 text-white/90" aria-label="Editar despesa">
                            <Icon name="edit" className="text-lg" />
                        </button>
                    </div>
                }
            />

            <main className="container mx-auto px-4 py-6 max-w-lg space-y-6">
                <div className="flex items-center gap-4">
                    <CategoryIcon category={expense.category} size="lg" />
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl font-bold text-ink break-words">{expense.description}</h1>
                        <Money value={expense.amount} className="text-2xl font-black text-primary-600 dark:text-primary-400" />
                    </div>
                </div>

                <p className="text-xs text-ink-faint">
                    Adicionado por {addedBy} a {formatRelativeOrDate(expense.date)}
                    {wasEdited && updatedBy && <> · Editado por {updatedBy}</>}
                </p>

                <div className="card p-4">
                    <ShareTree expense={expense} parties={parties!} myId={user?.id} />
                </div>

                {expense.split_mode === 'itemized' && (
                    <Button
                        variant="secondary"
                        block
                        onClick={() => nav.push(`/groups/${groupId}/expenses/${expense.id}/items`)}
                    >
                        Ver itens
                    </Button>
                )}

                {expense.notes && (
                    <div className="card p-4">
                        <p className="text-xs font-bold text-ink-faint uppercase tracking-wide mb-1">Notas</p>
                        <p className="text-sm text-ink whitespace-pre-wrap">{expense.notes}</p>
                    </div>
                )}

                {parties && user?.id && (
                    <CommentsBar
                        expense={expense}
                        groupId={groupId}
                        parties={parties}
                        currentUserId={user.id}
                    />
                )}
            </main>

            {parties && user?.id && (
                <ExpenseFormSheet
                    isOpen={showEdit}
                    onClose={() => setShowEdit(false)}
                    groupId={groupId}
                    parties={parties}
                    currentUserId={user.id}
                    expense={expense}
                    onSaved={() => setShowEdit(false)}
                    onOpenItems={(e) => nav.push(`/groups/${groupId}/expenses/${e.id}/items`, { haptic: false })}
                />
            )}
        </div>
    );
}
