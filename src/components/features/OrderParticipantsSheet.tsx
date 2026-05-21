'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import type { User } from '@/lib/types';
import { OrderParticipantsPicker } from './OrderParticipantsPicker';

interface OrderParticipantsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    groupMembers: User[];
    participantIds: string[];
    readOnly?: boolean;
    onSave?: (participantIds: string[]) => Promise<void>;
    submitting?: boolean;
    minimized?: boolean;
    onMinimize?: () => void;
    onExpand?: () => void;
    onDiscard?: () => void;
    minimizedAboveBottomNav?: boolean;
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
}: OrderParticipantsSheetProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>(participantIds);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }
        if (wasOpenRef.current) return;
        wasOpenRef.current = true;
        setSelectedIds(participantIds);
    }, [isOpen, participantIds]);

    const handleSave = async () => {
        if (!onSave || selectedIds.length === 0) return;
        await onSave(selectedIds);
    };

    const handleDiscard = () => {
        onDiscard?.() ?? onClose();
    };

    const minimizedSummary = useMemo(() => {
        if (readOnly) return `${selectedIds.length} participante(s)`;
        return `${selectedIds.length} selecionado(s)`;
    }, [readOnly, selectedIds.length]);

    const minimizable = !readOnly;

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="large"
            minimizable={minimizable}
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
            <OrderParticipantsPicker
                groupMembers={groupMembers}
                selectedParticipantIds={selectedIds}
                onSelectedChange={setSelectedIds}
                readOnly={readOnly}
            />
        </Sheet>
    );
}
