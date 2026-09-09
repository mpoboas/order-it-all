'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { BottomNav } from '@/components/layout/BottomNav';
import { EntityCardSkeletonGrid, PageHeaderSkeleton } from '@/components/ui/EntityCardSkeleton';
import { UnsavedDraftProvider } from '@/context/UnsavedDraftContext';
import { useGroup as useGroupRecord } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { useSyncStatus } from '@/context/SyncProvider';

export default function GroupLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const router = useRouter();
    const groupId = params.groupId as string;
    const { user, isLoggedIn } = useUser();
    const { currentGroup, setCurrentGroup, isAdmin } = useGroup();

    const group = useGroupRecord(groupId);
    const { hydrating, ready, setActiveGroup } = useSyncStatus();

    // Regista o grupo aberto — dispara a sincronização dos seus dados
    // (trips/orders/items/splits) e as subscrições realtime filtradas.
    useEffect(() => {
        setActiveGroup(groupId);
        return () => setActiveGroup(null);
    }, [groupId, setActiveGroup]);
    // O grupo pode não estar em cache (ex.: acabaste de ser convidado). Antes de
    // dizer "não encontrado", força um catch-up e espera por ele.
    const [probedId, setProbedId] = useState<string | null>(null);

    const isMember = !!(group && user?.id && group.members.includes(user.id));
    const loading =
        group === undefined ||
        (group === null && (hydrating || !ready || probedId !== groupId));
    const error = !loading && !isMember
        ? group === null
            ? 'Grupo não encontrado'
            : 'Não tens acesso a este grupo'
        : null;

    useEffect(() => {
        if (!isLoggedIn) {
            router.push('/');
        }
    }, [isLoggedIn, router]);

    useEffect(() => {
        if (!ready || group !== null || probedId === groupId) return;
        catchUp().finally(() => setProbedId(groupId));
    }, [ready, group, groupId, probedId]);

    // Mantém o GroupContext em sincronia com a cache local.
    useEffect(() => {
        if (isMember && group) setCurrentGroup(group);
    }, [isMember, group, setCurrentGroup]);

    if (!isLoggedIn) return null;

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)]">
                <PageHeaderSkeleton />
                <main className="container mx-auto px-4 py-6 md:py-8">
                    <EntityCardSkeletonGrid count={3} />
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                        <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{error}</h2>
                    <button
                        onClick={() => router.push('/groups')}
                        className="mt-4 px-6 py-2 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
                    >
                        Voltar aos Grupos
                    </button>
                </div>
            </div>
        );
    }

    return (
        <UnsavedDraftProvider>
            <div className={isAdmin ? 'has-bottom-nav' : ''}>
                {children}
                {/* Only show BottomNav for admins */}
                {isAdmin && currentGroup && <BottomNav groupId={groupId} />}
            </div>
        </UnsavedDraftProvider>
    );
}
