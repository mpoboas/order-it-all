'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { HeroHeader } from '@/components/features/HeroHeader';
import { GroupTabs } from '@/components/features/GroupTabs';
import { GroupOverviewBar } from '@/components/features/GroupOverviewBar';
import { getGroupHeroBackground, groupHeroAvatars } from '@/lib/groupAvatars';
import { EntityCardSkeletonGrid } from '@/components/ui/EntityCardSkeleton';
import { TripList } from '@/components/features/TripList';
import { Icon } from '@/components/ui/Icon';
import { useTrips, useGroup as useGroupRecord } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { useSyncStatus } from '@/context/SyncProvider';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function GroupTripsPage() {
    const params = useParams();
    const groupId = params.groupId as string;

    const { isLoggedIn } = useUser();
    const { isAdmin } = useGroup();
    const router = useRouter();
    const nav = useAppNavigate();

    // Direto do Dexie (já aquecido pela lista de grupos), não via
    // `GroupContext.currentGroup` — esse só atualiza num efeito do layout,
    // um tick depois deste render (ver Fase 14).
    const group = useGroupRecord(groupId);
    const tripsQuery = useTrips(groupId);
    const trips = tripsQuery ?? [];
    usePrefetchRoutes(trips.map((t) => `/groups/${groupId}/trips/${t.id}`));
    const { groupSyncing } = useSyncStatus();
    const loading = tripsQuery === undefined || (trips.length === 0 && groupSyncing);

    // Admins manage trips from the admin dashboard — the member trips list is redundant for them.
    useEffect(() => {
        if (isAdmin) router.replace(`/groups/${groupId}/admin`);
    }, [isAdmin, groupId, router]);

    if (!isLoggedIn) return null;
    if (isAdmin) return null;

    const heroAvatars = group ? groupHeroAvatars(group) : [];

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            {group && (
                <HeroHeader
                    variant="compact"
                    title={group.name}
                    background={getGroupHeroBackground(group)}
                    avatars={heroAvatars}
                    avatarOverflowCount={Math.max(0, group.members.length - heroAvatars.length)}
                    onBack={() => nav.up()}
                    topRightAction={isAdmin ? {
                        icon: 'settings',
                        label: 'Definições do grupo',
                        onClick: () => nav.push(`/groups/${groupId}/settings`, { haptic: false }),
                    } : undefined}
                />
            )}
            <GroupOverviewBar groupId={groupId} />
            <GroupTabs groupId={groupId} isAdmin={isAdmin} />

            <main className="container mx-auto max-w-2xl px-2 sm:px-4 py-4 pb-24">
                {/* Sem título — já vem do separador ativo ("Viagens") logo acima. */}
                <p className="mb-3 px-1 text-sm text-ink-soft animate-fade-in-up">Escolhe uma viagem para fazer o teu pedido</p>

                {/* Loading */}
                {loading ? (
                    <EntityCardSkeletonGrid count={3} />
                ) : trips.length === 0 ? (
                    /* Empty State */
                    <div className="text-center py-20 animate-fade-in-up">
                        <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-primary-50 dark:bg-primary-950 flex items-center justify-center">
                            <span className="text-6xl">🛒</span>
                        </div>
                        <h3 className="text-xl font-semibold text-ink mb-2">
                            Sem viagens disponíveis
                        </h3>
                        <p className="text-ink-soft mb-6 max-w-sm mx-auto">
                            Volta mais tarde para novas viagens ao supermercado!
                        </p>
                    </div>
                ) : (
                    <TripList
                        trips={trips}
                        hrefFor={(trip) => `/groups/${groupId}/trips/${trip.id}`}
                        onOpen={(trip) => nav.push(`/groups/${groupId}/trips/${trip.id}`, { haptic: false })}
                    />
                )}
            </main>

            {/* Pull to refresh hint on mobile */}
            {!loading && trips.length > 0 && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 md:hidden">
                    <button
                        onClick={() => void catchUp()}
                        className="px-4 py-2 bg-surface/80 backdrop-blur rounded-full shadow-lg text-sm text-ink-soft flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity"
                    >
                        <Icon name="refresh" className="text-base" />
                        Atualizar
                    </button>
                </div>
            )}
        </div>
    );
}
