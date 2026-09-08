'use client';

import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import type { Group, User } from '@/lib/types';

interface GroupMembersSheetProps {
    isOpen: boolean;
    onClose: () => void;
    group: Group;
}

export function GroupMembersSheet({ isOpen, onClose, group }: GroupMembersSheetProps) {
    const members: User[] = group.expand?.members ?? [];
    const admins = group.admins ?? [];

    // Creator first, then admins, then everyone else — each group alphabetical.
    const sorted = [...members].sort((a, b) => {
        const rank = (m: User) =>
            m.id === group.creator ? 0 : admins.includes(m.id) ? 1 : 2;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title="Membros do grupo"
            subtitle={`${members.length} ${members.length === 1 ? 'membro' : 'membros'}`}
            size="large"
            footer={
                <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-primary w-full py-4 text-lg font-semibold"
                >
                    Fechar
                </button>
            }
        >
            <div className="space-y-2">
                {sorted.map((member) => {
                    const isMemberCreator = group.creator === member.id;
                    const isMemberAdmin = admins.includes(member.id);

                    return (
                        <div
                            key={member.id}
                            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                        >
                            <Avatar
                                name={member.name}
                                src={getUserAvatarUrl(member.id, member.avatar)}
                                size="md"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                                    <span className="truncate">{member.name}</span>
                                    {isMemberCreator && (
                                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                            Dono
                                        </span>
                                    )}
                                    {isMemberAdmin && !isMemberCreator && (
                                        <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                            Admin
                                        </span>
                                    )}
                                </p>
                                {member.email && (
                                    <p className="truncate text-xs text-[var(--text-muted)]">
                                        {member.email}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Sheet>
    );
}
