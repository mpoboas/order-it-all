'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { useWebHaptics } from 'web-haptics/react';
import { fadeUpTransition, staggerContainerVariants, staggerItemVariants } from '@/lib/motion';
import { Icon } from '@/components/ui/Icon';

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
    const reduceMotion = useReducedMotion();

    return (
        <motion.button
            type="button"
            variants={staggerItemVariants}
            onClick={onClick}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            className={cn(
                'flex flex-col items-center gap-2 p-3 pt-3.5 rounded-2xl overflow-visible',
                selected
                    ? 'bg-primary-50/90 dark:bg-primary-950/40 ring-2 ring-primary-500 dark:ring-primary-400 shadow-sm'
                    : 'bg-surface ring-1 ring-hairline hover:ring-primary-300 dark:hover:ring-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/15'
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
                        ? 'text-primary-950 dark:text-primary-100'
                        : 'text-ink'
                )}
            >
                {member.name}
            </span>
        </motion.button>
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
            <motion.div
                className="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4 py-1 overflow-visible"
                variants={staggerContainerVariants}
                initial="enter"
                animate="center"
            >
                {groupMembers.map(member => (
                    <MemberPickCard
                        key={member.id}
                        member={member}
                        selected={selectedId === member.id}
                        onClick={() => pickSingleMember(member.id)}
                    />
                ))}
            </motion.div>
        );
    }

    return (
        <div className={cn('flex flex-col gap-6 flex-1 min-h-0', readOnly && 'gap-4')}>
            <motion.div
                className={cn(
                    'grid gap-4 shrink-0 py-1 overflow-visible',
                    readOnly ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'
                )}
            >
                {selectedMembers.map(member => (
                    <motion.div
                        key={member.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={fadeUpTransition}
                        className="relative flex flex-col items-center gap-2 p-3 pt-3.5 overflow-visible rounded-2xl bg-primary-50/90 dark:bg-primary-950/40 ring-1 ring-primary-100 dark:ring-primary-800/50"
                    >
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => removeParticipant(member.id)}
                                className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center shadow-md"
                                aria-label={`Remover ${member.name}`}
                            >
                                <Icon name="close" className="text-sm" />
                            </button>
                        )}
                        <Avatar
                            name={member.name}
                            src={getUserAvatarUrl(member.id, member.avatar)}
                            size="lg"
                        />
                        <span className="text-xs font-semibold text-center text-primary-950 dark:text-primary-100 line-clamp-2 max-w-full">
                            {member.name}
                        </span>
                    </motion.div>
                ))}
            </motion.div>

            {!readOnly && (
                <div className="flex flex-1 flex-col min-h-[min(40dvh,280px)]">
                    <label className="block text-xs font-bold text-ink-faint uppercase tracking-wide mb-2 px-1 shrink-0">
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
                        className="input w-full h-12 rounded-lg border-hairline bg-surface-sunken shrink-0"
                    />
                    {participantDropdownOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={fadeUpTransition}
                            className="mt-3 flex-1 min-h-0 flex flex-col rounded-xl border border-hairline bg-surface shadow-lg overflow-hidden"
                        >
                            {availableToAdd.length > 0 ? (
                                <ul className="overflow-y-auto overscroll-contain py-1 max-h-[min(50dvh,360px)]">
                                    {availableToAdd.map(m => (
                                        <li key={m.id}>
                                            <button
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => addParticipant(m.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-surface-sunken flex items-center gap-3 transition-colors"
                                            >
                                                <Avatar
                                                    name={m.name}
                                                    src={getUserAvatarUrl(m.id, m.avatar)}
                                                    size="sm"
                                                />
                                                <span className="font-semibold text-ink">
                                                    {m.name}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="px-4 py-6 text-sm text-center text-ink-faint">
                                    {participantSearch.trim()
                                        ? 'Nenhum membro encontrado'
                                        : 'Todos os membros já foram adicionados'}
                                </p>
                            )}
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    );
}
