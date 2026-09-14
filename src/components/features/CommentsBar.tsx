'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useComments } from '@/lib/db/hooks';
import { commentsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { assertOnline, mutationErrorMessage } from '@/lib/db/mutations';
import { useToast } from '@/context/ToastContext';
import { notify, notifiableUserIds } from '@/lib/notify';
import { partyLabel } from '@/lib/parties';
import { formatRelativeOrDate } from '@/lib/utils';
import type { Expense, Party } from '@/lib/types';

interface CommentsBarProps {
    expense: Expense;
    /** Omitido = despesa direta entre amigos, sem grupo (Fase 8). */
    groupId?: string;
    parties: Map<string, Party>;
    currentUserId: string;
    /** URL da despesa para a notificação — por omissão a rota de grupo. */
    notifyUrl?: string;
}

export function CommentsBar({ expense, groupId, parties, currentUserId, notifyUrl }: CommentsBarProps) {
    const comments = useComments(expense.id);
    const { showToast } = useToast();
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        const text = content.trim();
        if (!text || submitting) return;
        setSubmitting(true);
        try {
            assertOnline();
            const created = await commentsApi.create({
                expense_id: expense.id,
                group_id: groupId,
                participants: expense.participants,
                user: currentUserId,
                content: text,
            });
            await db.expense_comments.put(created);
            setContent('');

            const participantIds = Array.from(
                new Set([...expense.payers.map((p) => p.party), ...expense.shares.map((s) => s.party)]),
            );
            const targets = notifiableUserIds(participantIds, parties, currentUserId);
            void notify({
                targetUserIds: targets,
                title: '💬 Novo comentário',
                message: `${partyLabel(currentUserId, parties)} comentou em "${expense.description}": ${text.slice(0, 80)}`,
                url: notifyUrl ?? `/groups/${groupId}/expenses/${expense.id}`,
            });
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao comentar'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-ink-faint uppercase tracking-wide">Comentários</p>

            {comments === undefined ? null : comments.length === 0 ? (
                <p className="text-sm text-ink-faint">Ainda não há comentários.</p>
            ) : (
                <div className="space-y-3">
                    {comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2.5">
                            <Avatar
                                name={c.expand?.user?.name ?? partyLabel(c.user, parties)}
                                src={parties.get(c.user)?.avatar}
                                size="xs"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink">
                                    <span className="font-semibold">{c.expand?.user?.name ?? partyLabel(c.user, parties)}</span>{' '}
                                    {c.content}
                                </p>
                                <p className="text-[11px] text-ink-faint">{formatRelativeOrDate(c.created)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmit();
                    }}
                    placeholder="Adiciona um comentário…"
                    className="flex-1 px-3 py-2 rounded-xl border border-hairline bg-surface-sunken focus:bg-surface outline-none text-sm"
                />
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!content.trim() || submitting}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary-600 text-white disabled:opacity-40"
                    aria-label="Enviar comentário"
                >
                    <Icon name="send" className="text-lg" />
                </button>
            </div>
        </div>
    );
}
