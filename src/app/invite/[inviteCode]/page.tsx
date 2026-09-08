'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { groupsApi } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';

export default function InvitePage() {
    const params = useParams();
    const inviteCode = params.inviteCode as string;
    const router = useRouter();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();

    const [group, setGroup] = useState<Group | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadGroup = async () => {
            try {
                const groupData = await groupsApi.getByInviteCode(inviteCode);
                if (groupData) {
                    setGroup(groupData);
                } else {
                    setError('Convite inválido ou expirado.');
                }
            } catch (err) {
                console.error(err);
                setError('Erro ao carregar convite.');
            } finally {
                setLoading(false);
            }
        };

        if (inviteCode) {
            loadGroup();
        }
    }, [inviteCode]);

    const isMember = user && group && group.members.includes(user.id);

    const searchParams = useSearchParams();
    const shouldAutoJoin = searchParams.get('autoJoin') === 'true';

    // Auto-join / Auto-redirect effect
    useEffect(() => {
        if (!loading && group && isLoggedIn) {
            if (isMember) {
                // Already a member, just go there
                router.push(`/groups/${group.id}/trips`);
            } else if (shouldAutoJoin && !joining) {
                // Not a member, logged in, not currently joining, and HAS flag -> Auto Join
                handleJoin();
            }
        }
    }, [loading, group, isLoggedIn, isMember, joining, shouldAutoJoin]);

    const handleJoin = async () => {
        if (!isLoggedIn) {
            // Redirect to register preserving this location, with autoJoin flag
            const redirectUrl = encodeURIComponent(`/invite/${inviteCode}?autoJoin=true`);
            router.push(`/auth/register?redirect=${redirectUrl}`);
            return;
        }

        if (!group) return;

        setJoining(true);
        try {
            await groupsApi.addMember(group.id, user!.id);
            showToast(`Bem-vindo ao grupo ${group.name}!`, 'success');
            router.push(`/groups/${group.id}/trips`);
        } catch (err) {
            console.error(err);
            showToast('Erro ao entrar no grupo.', 'error');
            setJoining(false); // Only reset on error, otherwise we are navigating away
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen gradient-mesh flex items-center justify-center safe-screen">
                {/* Use a white spinner or custom one since we are on colored bg */}
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div >
        );
    }

    if (error || !group) {
        return (
            <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center p-4 text-center safe-screen">
                <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-6 shadow-lg border border-white/30 text-4xl">
                    😰
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Ups!</h1>
                <p className="text-white/80 mb-8 max-w-xs mx-auto">{error || 'Convite não encontrado.'}</p>
                <button
                    onClick={() => router.push('/')}
                    className="px-6 py-3 bg-white/20 backdrop-blur-md border border-white/40 rounded-xl text-white font-bold hover:bg-white/30 transition-all"
                >
                    Voltar ao início
                </button>
            </div>
        );
    }



    return (
        <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center p-4 relative overflow-hidden safe-screen">
            {/* Decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" />
            </div>

            <div className="w-full max-w-md bg-white/20 backdrop-blur-xl rounded-3xl p-8 border border-white/30 shadow-2xl relative z-10 text-center animate-fade-in-up">
                <div className="w-24 h-24 mx-auto mb-6 bg-white/20 backdrop-blur-md rounded-[2rem] flex items-center justify-center shadow-inner text-4xl overflow-hidden border border-white/30">
                    {group.avatar && group.avatar.length > 2 ? (
                        <img
                            src={`https://pb-orderit.povoas.top/api/files/groups/${group.id}/${group.avatar}`}
                            alt={group.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <span>{group.avatar || '👥'}</span>
                    )}
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">
                    {group.name}
                </h1>

                <p className="text-white/80 mb-8">
                    {group.expand?.creator?.name
                        ? `${group.expand.creator.name} convidou-te para entrar neste grupo.`
                        : 'Foste convidado para entrar neste grupo.'}
                </p>

                {isMember ? (
                    <div className="space-y-3">
                        <div className="bg-green-500/20 text-white border border-green-500/30 px-4 py-3 rounded-xl text-sm font-medium mb-4 backdrop-blur-sm">
                            Já és membro deste grupo!
                        </div>
                        <button
                            onClick={() => router.push(`/groups/${group.id}/trips`)}
                            className="w-full py-3.5 px-4 bg-white text-violet-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:bg-gray-50 transform active:scale-[0.98] transition-all"
                        >
                            Ver Grupo
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="w-full py-3.5 px-4 bg-white text-violet-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:bg-gray-50 transform active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {joining ? 'A entrar...' : (isLoggedIn ? 'Entrar no Grupo' : 'Aceitar convite')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
