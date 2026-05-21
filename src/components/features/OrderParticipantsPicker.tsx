'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { useWebHaptics } from 'web-haptics/react';

interface OrderParticipantsPickerProps {
    groupMembers: User[];
    selectedParticipantIds: string[];
    onSelectedChange: (ids: string[]) => void;
    readOnly?: boolean;
    /** Um membro: grelha de todos os membros, seleção única por toque */
    selectionMode?: 'multi' | 'single';
}

function MemberPickCard({
    member,
    selected,
    onClick,
}: {
    member: User;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-[0.98]',
                selected
                    ? 'bg-violet-50/90 dark:bg-violet-950/40 ring-2 ring-primary-500 dark:ring-primary-400 shadow-sm'
                    : 'bg-white dark:bg-slate-800 ring-1 ring-gray-200 dark:ring-slate-600 hover:ring-primary-300 dark:hover:ring-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/15'
            )}
            aria-pressed={selected}
        >
            <Avatar
                name={member.name}
                src={getUserAvatarUrl(member.id, member.avatar)}
                size="lg"
            />
            <span
                className={cn(
                    'text-xs font-semibold text-center line-clamp-2 max-w-full',
                    selected
                        ? 'text-violet-950 dark:text-violet-100'
                        : 'text-gray-800 dark:text-gray-100'
                )}
            >
                {member.name}
            </span>
        </button>
    );
}

export function OrderParticipantsPicker({
    groupMembers,
    selectedParticipantIds,
    onSelectedChange,
    readOnly = false,
    selectionMode = 'multi',
}: OrderParticipantsPickerProps) {
    const { trigger } = useWebHaptics();
    const [participantSearch, setParticipantSearch] = useState('');
    const [participantDropdownOpen, setParticipantDropdownOpen] = useState(false);

    const selectedId = selectionMode === 'single' ? selectedParticipantIds[0] : undefined;

    const selectedMembers = selectedParticipantIds
        .map(id => groupMembers.find(m => m.id === id))
        .filter(Boolean) as User[];

    const availableToAdd = groupMembers.filter(
        m =>
            !selectedParticipantIds.includes(m.id) &&
            m.name.toLowerCase().includes(participantSearch.toLowerCase())
    );

    const pickSingleMember = (memberId: string) => {
        trigger();
        onSelectedChange([memberId]);
    };

    const addParticipant = (memberId: string) => {
        trigger();
        if (!selectedParticipantIds.includes(memberId)) {
            onSelectedChange([...selectedParticipantIds, memberId]);
        }
        setParticipantSearch('');
        setParticipantDropdownOpen(false);
    };

    const removeParticipant = (memberId: string) => {
        trigger('nudge');
        onSelectedChange(selectedParticipantIds.filter(id => id !== memberId));
    };

    if (selectionMode === 'single' && !readOnly) {
        return (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4">
                {groupMembers.map(member => (
                    <MemberPickCard
                        key={member.id}
                        member={member}
                        selected={selectedId === member.id}
                        onClick={() => pickSingleMember(member.id)}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className={cn('flex flex-col gap-6 flex-1 min-h-0', readOnly && 'gap-4')}>
            <div
                className={cn(
                    'grid gap-4 shrink-0',
                    readOnly ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'
                )}
            >
                {selectedMembers.map(member => (
                    <div
                        key={member.id}
                        className="relative flex flex-col items-center gap-2 p-3 rounded-2xl bg-violet-50/90 dark:bg-violet-950/40 ring-1 ring-violet-100 dark:ring-violet-800/50"
                    >
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => removeParticipant(member.id)}
                                className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                                aria-label={`Remover ${member.name}`}
                            >
                                <span className="material-icons text-sm">close</span>
                            </button>
                        )}
                        <Avatar
                            name={member.name}
                            src={getUserAvatarUrl(member.id, member.avatar)}
                            size="lg"
                        />
                        <span className="text-xs font-semibold text-center text-violet-950 dark:text-violet-100 line-clamp-2 max-w-full">
                            {member.name}
                        </span>
                    </div>
                ))}
            </div>

            {!readOnly && (
                <div className="flex flex-1 flex-col min-h-[min(40dvh,280px)]">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1 shrink-0">
                        Adicionar participante
                    </label>
                    <input
                        type="text"
                        value={participantSearch}
                        onChange={e => {
                            setParticipantSearch(e.target.value);
                            setParticipantDropdownOpen(true);
                        }}
                        onFocus={() => setParticipantDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setParticipantDropdownOpen(false), 200)}
                        placeholder="Pesquisar membro..."
                        className="input w-full h-12 rounded-lg border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white shrink-0"
                    />
                    {participantDropdownOpen && (
                        <div className="mt-3 flex-1 min-h-0 flex flex-col rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
                            {availableToAdd.length > 0 ? (
                                <ul className="overflow-y-auto overscroll-contain py-1 max-h-[min(50dvh,360px)]">
                                    {availableToAdd.map(m => (
                                        <li key={m.id}>
                                            <button
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => addParticipant(m.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-primary-50 dark:hover:bg-slate-700 flex items-center gap-3"
                                            >
                                                <Avatar
                                                    name={m.name}
                                                    src={getUserAvatarUrl(m.id, m.avatar)}
                                                    size="sm"
                                                />
                                                <span className="font-semibold text-gray-800 dark:text-gray-100">
                                                    {m.name}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400">
                                    {participantSearch.trim()
                                        ? 'Nenhum membro encontrado'
                                        : 'Todos os membros já foram adicionados'}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
