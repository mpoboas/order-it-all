'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { groupsApi } from '@/lib/pocketbase';
import { BottomNav } from '@/components/layout/BottomNav';
import { EntityCardSkeletonGrid, PageHeaderSkeleton } from '@/components/ui/EntityCardSkeleton';
import { UnsavedDraftProvider } from '@/context/UnsavedDraftContext';
import { useRefreshHandler } from '@/context/RefreshContext';

export default function GroupLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const groupId = params.groupId as string;
    const { user, isLoggedIn } = useUser();
    const { currentGroup, setCurrentGroup, isAdmin } = useGroup();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadGroup = useCallback(async () => {
        if (!groupId || !user?.id) return;

        try {
            const group = await groupsApi.getById(groupId);

            // Check if user is a member
            if (!group.members.includes(user.id)) {
                setError('Não tens acesso a este grupo');
                return;
            }

            setError(null);
            setCurrentGroup(group);
        } catch (err) {
            console.error('Error loading group:', err);
            setError('Grupo não encontrado');
        } finally {
            setLoading(false);
        }
    }, [groupId, user?.id, setCurrentGroup]);

    // Este layout nao remonta ao navegar entre viagens/divisor/admin do mesmo
    // grupo, por isso o pathname esta nas dependencias: cada ecra que abre volta
    // a pedir o grupo (membros e admins podem ter mudado entretanto).
    useEffect(() => {
        if (!isLoggedIn) {
            router.push('/');
            return;
        }

        loadGroup();

        return () => {
            // Don't clear group on unmount to prevent flicker during navigation
        };
    }, [isLoggedIn, router, loadGroup, pathname]);

    useRefreshHandler(loadGroup);

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
