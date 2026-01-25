'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { groupsApi } from '@/lib/pocketbase';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { useToast } from '@/context/ToastContext';

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const { user, isLoggedIn } = useUser();
    const router = useRouter();
    const { showToast } = useToast();

    useEffect(() => {
        // Wait for user state to hydrate
        // actually useUser context returns isLoggedIn which is derived from user being not null.
        // We might need a proper isLoading state from context if it's there. 
        // Based on previous files, context DOES NOT export isLoading, but uses isHydrated internally.
        // We can infer loading if we are just mounting, but better to check if user is resolved.

        // Let's assume user is resolved quickly. 

        const handleInvite = async () => {
            if (!isLoggedIn) {
                // Not logged in: Store invite and redirect to login
                localStorage.setItem('pendingInviteCode', code);
                showToast('Faz login para aceitar o convite', 'info');
                router.push('/auth/register'); // Send to register by default for new users? Or general auth page?
                return;
            }

            try {
                // Logged in: Try to join
                const group = await groupsApi.getByInviteCode(code);
                if (!group) {
                    showToast('Convite inválido ou expirado', 'error');
                    router.push('/groups');
                    return;
                }

                await groupsApi.join(group.id, user.id);
                showToast(`Entraste em ${group.name}!`, 'success');
                router.push(`/groups/${group.id}`);
            } catch (error) {
                console.error('Invite error:', error);
                showToast('Erro ao processar convite', 'error');
                router.push('/groups');
            }
        };

        // Small delay to ensure auth state is stable if needed, or just run immediately if we trust isLoggedIn
        // Since we don't have explicit isLoading from useUser, we rely on the fact that if user is null *initially* it might be loading or not logged in.
        // But useUser in Context *waits* for hydration before rendering children. So we are safe.

        handleInvite();

    }, [code, isLoggedIn, router, user, showToast]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] p-4">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-[var(--text-muted)] font-medium animate-pulse">A verificar convite...</p>
        </div>
    );
}
