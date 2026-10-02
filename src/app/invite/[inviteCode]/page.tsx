'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { groupsApi } from '@/lib/pocketbase';
import type { InvitePreview } from '@/lib/types';
import { getGroupAvatarUrl, guessGroupEmoji } from '@/lib/groupAvatars';
import { groupHomeHref } from '@/lib/navHierarchy';
import { withRedirect } from '@/lib/authRedirect';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { AuthBackdrop, AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';

const LOAD_FAILED = 'load-failed';

export default function InvitePage() {
    const params = useParams();
    const inviteCode = params.inviteCode as string;
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();

    const [group, setGroup] = useState<InvitePreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadGroup = async () => {
            try {
                const groupData = await groupsApi.previewInvite(inviteCode);
                if (groupData) {
                    setGroup(groupData);
                } else {
                    setError('Convite inválido ou expirado.');
                }
            } catch (err) {
                console.error(err);
                setError(LOAD_FAILED);
            } finally {
                setLoading(false);
            }
        };

        if (inviteCode) {
            loadGroup();
        }
        // `isLoggedIn` nas deps: a pré-visualização só sabe se "já és membro"
        // quando o pedido leva sessão.
    }, [inviteCode, isLoggedIn]);

    const isMember = !!user && !!group?.isMember;

    const searchParams = useSearchParams();
    const shouldAutoJoin = searchParams.get('autoJoin') === 'true';

    // Com sessão: já membro → vai direto para o grupo; veio de entrar/criar
    // conta (`autoJoin`) → junta-se sem pedir outro toque. `replace` nos dois:
    // voltar atrás a partir do grupo não deve reabrir o convite.
    useEffect(() => {
        if (!loading && group && isLoggedIn) {
            if (isMember) {
                nav.replace(groupHomeHref(group.groupId), { haptic: false });
            } else if (shouldAutoJoin && !joining) {
                handleJoin();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `nav`/`handleJoin` mudam a cada render
    }, [loading, group, isLoggedIn, isMember, joining, shouldAutoJoin]);

    // Sem sessão: depois de entrar/criar conta volta aqui com `autoJoin`
    // (codificado — ver `authRedirect.ts`).
    const returnHere = `/invite/${inviteCode}?autoJoin=true`;

    const handleJoin = async () => {
        if (!isLoggedIn) {
            nav.push(withRedirect('/auth/register', returnHere));
            return;
        }
        if (!group) return;

        setJoining(true);
        try {
            const groupId = await groupsApi.joinByInvite(inviteCode);
            showToast(`Bem-vindo ao grupo ${group.name}!`, 'success');
            nav.replace(groupHomeHref(groupId), { haptic: false });
        } catch (err) {
            console.error(err);
            showToast('Erro ao entrar no grupo.', 'error');
            setJoining(false); // só no erro — no sucesso já está a sair daqui
        }
    };

    if (loading || (group && isMember)) {
        return (
            <AuthBackdrop className="items-center justify-center">
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                </div>
            </AuthBackdrop>
        );
    }

    if (error || !group) {
        const loadFailed = error === LOAD_FAILED;
        return (
            <AuthShell
                icon={loadFailed ? 'cloud_off' : 'link_off'}
                title={loadFailed ? 'Não deu para abrir o convite' : 'Convite inválido'}
                subtitle={
                    loadFailed
                        ? 'Verifica a ligação à internet e tenta outra vez.'
                        : 'Este link já não é válido. Pede um novo a quem te convidou.'
                }
            >
                <Button size="lg" block onClick={() => nav.replace(isLoggedIn ? '/groups' : '/')}>
                    {isLoggedIn ? 'Ir para os meus grupos' : 'Voltar ao início'}
                </Button>
            </AuthShell>
        );
    }

    const avatarUrl = getGroupAvatarUrl(group.groupId, group.avatar);

    return (
        <AuthBackdrop>
            <main className="flex-1 flex flex-col justify-center px-4 py-8">
                <div className="w-full max-w-sm mx-auto text-center auth-card px-6 py-8 animate-fade-in-up">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-surface-sunken border border-hairline flex items-center justify-center text-4xl overflow-hidden">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- ficheiro do PocketBase
                            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span>{guessGroupEmoji(group.avatar)}</span>
                        )}
                    </div>
                    <p className="text-sm font-medium text-ink-soft">
                        {group.creatorName ? `${group.creatorName} convidou-te para` : 'Foste convidado para'}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink text-balance">{group.name}</h1>
                    <p className="mt-3 text-base text-ink-soft text-pretty">
                        Aqui combinam as compras e acertam as contas do grupo.
                    </p>
                </div>
            </main>

            <div className="w-full max-w-sm mx-auto px-4 pb-4 space-y-3 on-brand">
                {isLoggedIn ? (
                    <Button variant="inverse" size="lg" block loading={joining} onClick={handleJoin}>
                        Entrar no grupo
                    </Button>
                ) : (
                    <>
                        <Button variant="inverse" size="lg" block onClick={handleJoin}>
                            Criar conta e entrar
                        </Button>
                        <Button size="lg" variant="ghost" block onClick={() => nav.push(withRedirect('/auth/login', returnHere))}>
                            Já tenho conta
                        </Button>
                    </>
                )}
            </div>
        </AuthBackdrop>
    );
}
