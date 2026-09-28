'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { Header } from '@/components/layout/Header';
import { GroupInfo } from '@/components/features/GroupInfo';
import { ListSkeleton } from '@/components/ui/ListSkeleton';

/** Definições do grupo — abertas a todos os membros (ver quem está, convidar, sair);
 *  as ações de gestão e as preferências só aparecem a admins. Reachável pelo
 *  engrenagem no cabeçalho do grupo (`HeroHeader`). O URL continua
 *  `/settings` para não partir links/atalhos antigos. */
export default function GroupInfoPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const { user, isLoggedIn } = useUser();
    const { currentGroup, isAdmin, refreshGroup } = useGroup();

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app">
            <Header title="Definições do grupo" showBack />
            {!currentGroup || currentGroup.id !== groupId ? (
                <div className="container mx-auto max-w-lg px-4 py-6">
                    <ListSkeleton rows={6} leading="person" trailing={false} />
                </div>
            ) : (
                <GroupInfo
                    group={currentGroup}
                    isAdmin={isAdmin}
                    isCreator={currentGroup.creator === user?.id}
                    currentUserId={user?.id}
                    onGroupUpdated={refreshGroup}
                />
            )}
        </div>
    );
}
