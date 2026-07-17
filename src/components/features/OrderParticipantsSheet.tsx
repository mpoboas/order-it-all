'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import type { User } from '@/lib/types';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { cn } from '@/lib/utils';
import { OrderParticipantsPicker } from './OrderParticipantsPicker';

interface OrderParticipantsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    groupMembers: User[];
    participantIds: string[];
    readOnly?: boolean;
    onSave?: (participantIds: string[], creatorUserId?: string) => Promise<void>;
    submitting?: boolean;
    minimized?: boolean;
    onMinimize?: () => void;
    onExpand?: () => void;
    onDiscard?: () => void;
    minimizedAboveBottomNav?: boolean;
    onDraftActiveChange?: (active: boolean) => void;
    /** Admin-only: show a "Pedido por" picker to reassign who placed the order */
    allowCreatorChange?: boolean;
    creatorUserId?: string;
}

export function OrderParticipantsSheet({
    isOpen,
    onClose,
    title,
    groupMembers,
    participantIds,
    readOnly = false,
    onSave,
    submitting = false,
    minimized = false,
    onMinimize,
    onExpand,
    onDiscard,
    minimizedAboveBottomNav = true,
    onDraftActiveChange,
    allowCreatorChange = false,
    creatorUserId = '',
}: OrderParticipantsSheetProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>(participantIds);
    const [selectedCreatorId, setSelectedCreatorId] = useState(creatorUserId);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }
        if (wasOpenRef.current) return;
        wasOpenRef.current = true;
        setSelectedIds(participantIds);
        setSelectedCreatorId(creatorUserId);
    }, [isOpen, participantIds, creatorUserId]);

    const handleSave = async () => {
        if (!onSave || selectedIds.length === 0) return;
        await onSave(selectedIds, allowCreatorChange ? selectedCreatorId : undefined);
    };

    const handleDiscard = () => {
        onDiscard?.() ?? onClose();
    };

    const allParticipantsSelected =
        groupMembers.length > 0 && selectedIds.length === groupMembers.length;

    const toggleAllParticipants = () => {
        setSelectedIds(allParticipantsSelected ? [] : groupMembers.map(m => m.id));
    };

    const minimizedSummary = useMemo(() => {
        if (readOnly) return `${selectedIds.length} participante(s)`;
        return `${selectedIds.length} selecionado(s)`;
    }, [readOnly, selectedIds.length]);

    const minimizable = !readOnly;

    const isDraftActive = useMemo(() => {
        if (readOnly) return false;
        const initial = [...participantIds].sort().join(',');
        const current = [...selectedIds].sort().join(',');
        const creatorChanged = allowCreatorChange && selectedCreatorId !== creatorUserId;
        return initial !== current || creatorChanged;
    }, [readOnly, participantIds, selectedIds, allowCreatorChange, selectedCreatorId, creatorUserId]);

    useEffect(() => {
        onDraftActiveChange?.(isOpen ? isDraftActive : false);
    }, [isOpen, isDraftActive, onDraftActiveChange]);

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="large"
            minimizable={minimizable}
            draftActive={isDraftActive}
            minimized={minimized}
            onMinimize={onMinimize}
            onExpand={onExpand}
            onDiscard={minimizable ? handleDiscard : undefined}
            minimizedSummary={minimizedSummary}
            discardConfirmMessage="Descartar alterações aos participantes?"
            minimizedAboveBottomNav={minimizedAboveBottomNav}
            footer={
                readOnly ? (
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-primary w-full py-4 text-lg font-semibold"
                    >
                        Fechar
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={selectedIds.length === 0 || submitting}
                        onClick={handleSave}
                        className="btn btn-primary w-full py-4 text-lg font-semibold shadow-lg shadow-violet-200/50 disabled:opacity-50"
                    >
                        {submitting ? 'A guardar...' : 'Guardar'}
                    </button>
                )
            }
        >
            {allowCreatorChange && !readOnly && (
                <div className="mb-5">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
                        Pedido por
                    </label>
                    <div className="flex gap-3 overflow-x-auto p-1.5 -m-1.5 no-scrollbar">
                        {groupMembers.map(member => {
                            const selected = selectedCreatorId === member.id;
                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => setSelectedCreatorId(member.id)}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 shrink-0 w-16 py-2 rounded-2xl transition-all',
                                        selected
                                            ? 'bg-violet-50/90 dark:bg-violet-950/40 ring-2 ring-primary-500 dark:ring-primary-400'
                                            : 'ring-1 ring-transparent hover:ring-gray-200 dark:hover:ring-slate-700'
                                    )}
                                    aria-pressed={selected}
                                >
                                    <Avatar
                                        name={member.name}
                                        src={getUserAvatarUrl(member.id, member.avatar)}
                                        size="md"
                                    />
                                    <span
                                        className={cn(
                                            'text-[11px] font-semibold text-center line-clamp-1 max-w-full',
                                            selected
                                                ? 'text-violet-950 dark:text-violet-100'
                                                : 'text-gray-600 dark:text-gray-300'
                                        )}
                                    >
                                        {member.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {!readOnly && (
                <div className="flex items-center justify-between mb-2 px-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Participantes
                    </label>
                    <button
                        type="button"
                        onClick={toggleAllParticipants}
                        className="text-[10px] font-bold text-violet-600 hover:underline bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 rounded-md"
                    >
                        {allParticipantsSelected ? 'Ninguém' : 'Todos'}
                    </button>
                </div>
            )}

            <OrderParticipantsPicker
                groupMembers={groupMembers}
                selectedParticipantIds={selectedIds}
                onSelectedChange={setSelectedIds}
                readOnly={readOnly}
            />
        </Sheet>
    );
}
