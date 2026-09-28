'use client';

import { useMemo } from 'react';
import type { Group } from '@/lib/types';
import { usePlaceholders } from '@/lib/db/hooks';
import { groupMembersFromExpand } from '@/lib/parties';
import { getUserAvatarUrl } from '@/lib/orderParticipants';

/**
 * Quem aparece no stack de avatares da capa do grupo — UMA definição para os
 * separadores todos (Despesas, Viagens, Admin): membros com conta + pessoas
 * sem conta ainda por associar, o mesmo que a lista das Definições do grupo.
 * Antes Despesas contava as "partes" do livro de contas (com as pessoas sem
 * conta) e Viagens só os membros com conta — o mesmo grupo mostrava "+10"
 * num separador e "+6" no outro; e as fotos vinham só de `expand.members`,
 * que deixa de fora o dono e os admins.
 */
export function useGroupHeroPeople(group: Group | null | undefined, max = 3) {
    const placeholders = usePlaceholders(group?.id);
    return useMemo(() => {
        const users = groupMembersFromExpand(group);
        const guests = (placeholders ?? []).filter((p) => !p.claimed_by);
        const people = [
            ...users.map((u) => ({ name: u.name || u.username || '?', src: getUserAvatarUrl(u.id, u.avatar) })),
            ...guests.map((p) => ({ name: p.name, src: undefined as string | undefined })),
        ];
        // Com conta e com foto primeiro — a capa mostra caras, não iniciais.
        const withPhotoFirst = [...people].sort((a, b) => Number(!!b.src) - Number(!!a.src));
        const avatars = withPhotoFirst.slice(0, max);
        return { avatars, overflow: Math.max(0, people.length - avatars.length), total: people.length };
    }, [group, placeholders, max]);
}
