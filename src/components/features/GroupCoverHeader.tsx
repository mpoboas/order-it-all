'use client';

import { coverGradientFor } from '@/lib/coverColor';
import { Icon } from '@/components/ui/Icon';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import type { Group } from '@/lib/types';

interface GroupCoverHeaderProps {
    group: Group;
    memberCount: number;
    onMembersClick: () => void;
    isAdmin: boolean;
}

/** Capa colorida no topo dos ecrãs "raiz" do grupo (Despesas/Saldos/
 *  Admin·Viagens) — à Splitwise: cor lisa estável por grupo (sem depender de
 *  ilustrações que não temos), voltar à esquerda, engrenagem à direita
 *  (definições do grupo — só admins, substitui as antigas abas "Membros" e
 *  "Definições"), nome do grupo e pastilha "N pessoas". */
export function GroupCoverHeader({ group, memberCount, onMembersClick, isAdmin }: GroupCoverHeaderProps) {
    const nav = useAppNavigate();

    return (
        <div className="px-4 pt-3 pb-4" style={{ background: coverGradientFor(group.name) }}>
            <div className="flex items-center justify-between mb-3">
                <button
                    type="button"
                    aria-label="Voltar"
                    onClick={() => nav.up()}
                    className="w-9 h-9 rounded-xl bg-black/20 backdrop-blur flex items-center justify-center text-white hover:bg-black/30 transition-colors active:scale-95"
                >
                    <Icon name="chevron_left" className="text-xl" />
                </button>
                {isAdmin && (
                    <button
                        type="button"
                        aria-label="Definições do grupo"
                        onClick={() => nav.push(`/groups/${group.id}/settings`, { haptic: false })}
                        className="w-9 h-9 rounded-xl bg-black/20 backdrop-blur flex items-center justify-center text-white hover:bg-black/30 transition-colors active:scale-95"
                    >
                        <Icon name="settings" className="text-xl" />
                    </button>
                )}
            </div>
            <h1 className="text-2xl font-bold text-white truncate">{group.name}</h1>
            <button
                type="button"
                onClick={onMembersClick}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 backdrop-blur text-white text-sm font-semibold hover:bg-black/30 transition-colors"
            >
                <Icon name="groups" className="text-base" />
                {memberCount} {memberCount === 1 ? 'pessoa' : 'pessoas'}
            </button>
        </div>
    );
}
