'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { groupsApi } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

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

    // Auto-join / Auto-redirect effect
    useEffect(() => {
        if (!loading && group && isLoggedIn) {
            if (isMember) {
                // Already a member, just go there
                router.push(`/groups/${group.id}/trips`);
            } else if (!joining) {
                // Not a member, logged in, and not currently joining -> Auto Join
                handleJoin();
            }
        }
    }, [loading, group, isLoggedIn, isMember, joining]);

    const handleJoin = async () => {
        if (!isLoggedIn) {
            // Redirect to login preserving this location
            router.push(`/auth/login?redirect=/invite/${inviteCode}`);
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
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (error || !group) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] p-4 text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4 text-3xl">
                    😰
                </div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Ups!</h1>
                <p className="text-[var(--text-secondary)] mb-6">{error || 'Convite não encontrado.'}</p>
                <Button onClick={() => router.push('/')} variant="ghost">
                    Voltar ao início
                </Button>
            </div>
        );
    }



    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] p-4 relative overflow-hidden">
            {/* Background blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-3xl" />

            <div className="card max-w-sm w-full p-8 relative z-10 text-center animate-fade-in-up">
                <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-[2rem] flex items-center justify-center shadow-inner text-4xl overflow-hidden">
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

                <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                    {group.name}
                </h1>

                <p className="text-[var(--text-secondary)] mb-8">
                    {group.expand?.creator?.name
                        ? `${group.expand.creator.name} convidou-te para entrar neste grupo.`
                        : 'Foste convidado para entrar neste grupo.'}
                </p>

                {isMember ? (
                    <div className="space-y-3">
                        <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium mb-4">
                            Já és membro deste grupo!
                        </div>
                        <Button
                            onClick={() => router.push(`/groups/${group.id}/trips`)}
                            className="btn-primary w-full"
                        >
                            Ver Grupo
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Button
                            onClick={handleJoin}
                            disabled={joining}
                            className="btn-primary w-full py-3 text-lg"
                        >
                            {joining ? 'A entrar...' : (isLoggedIn ? 'Entrar no Grupo' : 'Entrar / Registar para Aceitar')}
                        </Button>
                        {!isLoggedIn && (
                            <p className="text-xs text-[var(--text-muted)]">
                                Serás redirecionado para o login.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
