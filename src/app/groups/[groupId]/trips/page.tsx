'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { Header } from '@/components/layout/Header';
import { EntityCardSkeletonGrid } from '@/components/ui/EntityCardSkeleton';
import { TripCard } from '@/components/features/TripCard';
import { useTrips } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { useSyncStatus } from '@/context/SyncProvider';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function GroupTripsPage() {
    const params = useParams();
    const groupId = params.groupId as string;

    const { user, isLoggedIn } = useUser();
    const { currentGroup, isAdmin } = useGroup();
    const router = useRouter();
    const nav = useAppNavigate();

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

    const userName = user?.name || user?.email || '??';

    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            <Header
                title={currentGroup?.name || 'Viagens'}
                subtitle="Viagens ativas"
                showBack
                groupId={groupId}
            />

            <main className="container mx-auto px-4 py-6 md:py-8">
                {/* Greeting */}
                <div className="mb-8 animate-fade-in-up">
                    <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-1">
                        Olá, <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">{userName}</span>! 👋
                    </h2>
                    <p className="text-[var(--text-secondary)]">Seleciona uma viagem para fazer o teu pedido</p>
                </div>

                {/* Loading */}
                {loading ? (
                    <EntityCardSkeletonGrid count={3} />
                ) : trips.length === 0 ? (
                    /* Empty State */
                    <div className="text-center py-20 animate-fade-in-up">
                        <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/40 dark:to-primary-900/20 flex items-center justify-center">
                            <span className="text-6xl">🛒</span>
                        </div>
                        <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                            Sem viagens disponíveis
                        </h3>
                        <p className="text-[var(--text-secondary)] mb-6 max-w-sm mx-auto">
                            {isAdmin
                                ? 'Cria uma nova viagem na área de admin!'
                                : 'Volta mais tarde para novas viagens ao supermercado!'
                            }
                        </p>
                    </div>
                ) : (
                    /* Trips Grid */
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {trips.map((trip, index) => (
                            <TripCard
                                key={trip.id}
                                trip={trip}
                                href={`/groups/${groupId}/trips/${trip.id}`}
                                onClick={() => nav.push(`/groups/${groupId}/trips/${trip.id}`, { haptic: false })}
                                style={{ animationDelay: `${index * 0.05}s` }}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Pull to refresh hint on mobile */}
            {!loading && trips.length > 0 && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 md:hidden">
                    <button
                        onClick={() => void catchUp()}
                        className="px-4 py-2 bg-white/80 backdrop-blur rounded-full shadow-lg text-sm text-[var(--text-secondary)] flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Atualizar
                    </button>
                </div>
            )}
        </div>
    );
}
