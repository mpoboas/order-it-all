'use client';

import { useEffect, useState } from 'react';
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
}: OrderParticipantsSheetProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>(participantIds);

    useEffect(() => {
        if (isOpen) {
            setSelectedIds(participantIds);
        }
    }, [isOpen, participantIds]);

    const handleSave = async () => {
        if (!onSave || selectedIds.length === 0) return;
        await onSave(selectedIds);
    };

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="large"
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
