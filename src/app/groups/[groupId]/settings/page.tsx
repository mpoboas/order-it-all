'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { GroupSettingsTab } from '@/components/features/GroupSettingsTab';

/** Definições do grupo — combina as antigas abas "Membros" e "Definições"
 *  do Admin numa só página, reachável pela engrenagem no cabeçalho do
 *  grupo (`HeroHeader`). Só admins chegam aqui. */
export default function GroupSettingsPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const { user, isLoggedIn } = useUser();
    const { currentGroup, isAdmin, refreshGroup } = useGroup();

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    useEffect(() => {
        if (currentGroup && !isAdmin) router.push(`/groups/${groupId}/trips`);
    }, [currentGroup, isAdmin, groupId, router]);

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app">
            <Header title="Definições do grupo" showBack />

            <main className="container mx-auto px-4 py-6 max-w-2xl">
                {!currentGroup || !isAdmin ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : (
                    <GroupSettingsTab
                        group={currentGroup}
                        groupId={groupId}
                        isCreator={currentGroup.creator === user?.id}
                        currentUserId={user?.id}
                        onGroupUpdated={refreshGroup}
                    />
                )}
            </main>
        </div>
    );
}
