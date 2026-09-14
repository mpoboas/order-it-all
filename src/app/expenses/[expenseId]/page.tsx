'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSmartRouter } from '@/hooks/useSmartRouter';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useExpense, usePartiesForUserIds } from '@/lib/db/hooks';
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
import { ShareTree } from '@/components/features/ShareTree';
import { ExpenseFormSheet } from '@/components/features/ExpenseFormSheet';
import { formatRelativeOrDate } from '@/lib/utils';
import { expenseReceiptUrl } from '@/lib/expenseDisplay';
import { useAppNavigate } from '@/hooks/useAppNavigate';

/** Detalhe de uma despesa DIRETA, sem grupo (Fase 8) — equivalente a
 *  `/groups/[groupId]/expenses/[expenseId]/page.tsx`, mas para despesas
 *  entre dois amigos. Sem "Ver itens" (itemizada precisa de um `Split`,
 *  sempre acoplado a um grupo — despesas diretas não suportam esse modo). */
export default function DirectExpenseDetailPage() {
    const params = useParams();
    const expenseId = params.expenseId as string;
    const router = useSmartRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();
    const confirmAction = useConfirm();

    const expense = useExpense(expenseId);
    const parties = usePartiesForUserIds(expense?.participants);
    const loading = expense === undefined || parties === undefined;

    const [showEdit, setShowEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);

    const otherUserId = useMemo(
        () => expense?.participants?.find((id) => id !== user?.id),
        [expense, user],
    );
    const returnUrl = otherUserId ? `/people/${otherUserId}` : '/activity';

    const handleReceiptChange = async (file: File | undefined) => {
        if (!file || !expense || !user?.id) return;
        setUploadingReceipt(true);
        try {
            const updated = await expensesApi.uploadReceipt(expense.id, file, user.id);
            await db.expenses.put(updated);
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao anexar recibo'), 'error');
        } finally {
            setUploadingReceipt(false);
        }
    };

    const handleRemoveReceipt = async () => {
        if (!expense || !user?.id) return;
        setUploadingReceipt(true);
        try {
            const updated = await expensesApi.removeReceipt(expense.id, user.id);
            await db.expenses.put(updated);
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao remover recibo'), 'error');
        } finally {
            setUploadingReceipt(false);
        }
    };

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
                    url: returnUrl,
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
                <Header title="Detalhes" showBack />
                <div className="flex justify-center py-20">
                    <LoadingSpinner size="lg" />
                </div>
            </div>
        );
    }

    if (!expense) {
        return (
            <div className="min-h-dvh bg-app">
                <Header title="Detalhes" showBack />
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
                actions={
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={handleDelete} disabled={deleting} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-sunken text-ink-soft" aria-label="Eliminar despesa">
                            <Icon name="delete_outline" className="text-lg" />
                        </button>
                        <button type="button" onClick={() => setShowEdit(true)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-sunken text-ink-soft" aria-label="Editar despesa">
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
                    Adicionado por {addedBy} a {formatRelativeOrDate(expense.created)}
                    {wasEdited && updatedBy && <> · Editado por {updatedBy}</>}
                </p>

                <div className="card p-4">
                    <ShareTree expense={expense} parties={parties!} myId={user?.id} />
                </div>

                {expense.notes && (
                    <div className="card p-4">
                        <p className="text-xs font-bold text-ink-faint uppercase tracking-wide mb-1">Notas</p>
                        <p className="text-sm text-ink whitespace-pre-wrap">{expense.notes}</p>
                    </div>
                )}

                <div>
                    <p className="text-xs font-bold text-ink-faint uppercase tracking-wide mb-1.5">Recibo</p>
                    {expenseReceiptUrl(expense) ? (
                        <div className="relative w-28">
                            <img
                                src={expenseReceiptUrl(expense)}
                                alt="Recibo"
                                className="w-28 h-28 object-cover rounded-xl border border-hairline"
                            />
                            <button
                                type="button"
                                onClick={handleRemoveReceipt}
                                disabled={uploadingReceipt}
                                className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-danger text-white shadow"
                                aria-label="Remover recibo"
                            >
                                <Icon name="close" className="text-sm" />
                            </button>
                        </div>
                    ) : (
                        <label className="flex flex-col items-center justify-center w-28 h-28 rounded-xl border-2 border-dashed border-hairline-strong text-ink-faint cursor-pointer hover:border-primary-400 transition-colors">
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                disabled={uploadingReceipt}
                                onChange={(e) => handleReceiptChange(e.target.files?.[0])}
                            />
                            <Icon name="photo_camera" className="text-2xl" />
                            <span className="text-[11px] mt-1">{uploadingReceipt ? 'A carregar…' : 'Adicionar'}</span>
                        </label>
                    )}
                </div>

                {parties && user?.id && (
                    <CommentsBar
                        expense={expense}
                        parties={parties}
                        currentUserId={user.id}
                        notifyUrl={`/expenses/${expense.id}`}
                    />
                )}
            </main>

            {parties && user?.id && (
                <ExpenseFormSheet
                    isOpen={showEdit}
                    onClose={() => setShowEdit(false)}
                    parties={parties}
                    currentUserId={user.id}
                    expense={expense}
                    onSaved={() => setShowEdit(false)}
                    notifyUrl={(e) => `/expenses/${e.id}`}
                />
            )}
        </div>
    );
}
