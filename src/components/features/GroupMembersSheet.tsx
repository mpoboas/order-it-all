'use client';

import { useMemo } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { useGroupLedger } from '@/lib/db/hooks';
import { canonicalPartyId } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { cn } from '@/lib/utils';
import type { Group, User } from '@/lib/types';

const EPS_CENTS = 1;

interface GroupMembersSheetProps {
    isOpen: boolean;
    onClose: () => void;
    group: Group;
}

export function GroupMembersSheet({ isOpen, onClose, group }: GroupMembersSheetProps) {
    const members: User[] = useMemo(() => group.expand?.members ?? [], [group.expand?.members]);
    const admins = useMemo(() => group.admins ?? [], [group.admins]);
    const ledger = useGroupLedger(isOpen ? group.id : undefined);

    // Creator first, then admins, then everyone else — each group alphabetical.
    const sorted = useMemo(() => {
        const rank = (m: User) =>
            m.id === group.creator ? 0 : admins.includes(m.id) ? 1 : 2;
        return [...members].sort(
            (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
        );
    }, [members, admins, group.creator]);

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
                                        <span className="shrink-0 rounded bg-warning-bg px-1.5 py-0.5 text-xs text-warning-fg">
                                            Dono
                                        </span>
                                    )}
                                    {isMemberAdmin && !isMemberCreator && (
                                        <span className="shrink-0 rounded bg-primary-100 px-1.5 py-0.5 text-xs text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
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
                            {ledger && (() => {
                                const netCents = ledger.net[canonicalPartyId(member.id, ledger.parties)] ?? 0;
                                const settled = Math.abs(netCents) < EPS_CENTS;
                                return (
                                    <div className="text-right shrink-0">
                                        <p className={cn('text-[10px] font-bold uppercase', settled ? 'text-ink-faint' : netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                            {settled ? 'em dia' : netCents > 0 ? 'recebe' : 'deve'}
                                        </p>
                                        {!settled && (
                                            <Money
                                                value={Math.abs(fromCents(netCents))}
                                                className={cn('text-sm font-bold', netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}
                                            />
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>
        </Sheet>
    );
}
