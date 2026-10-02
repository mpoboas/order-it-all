'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useUser } from '@/context/UserContext';
import { groupsApi } from '@/lib/pocketbase';
import { safeRedirect } from '@/lib/authRedirect';
import { getGroupAvatarUrl, guessGroupEmoji } from '@/lib/groupAvatars';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationPreview } from '@/components/features/NotificationPreview';
import { IosInstallSteps } from '@/components/features/IosInstallSteps';
import {
    entityListCardClassName,
    EntityCardTitle,
    EntityMetaItem,
    EntityStatusPill,
    EntityCardAsideTotal,
} from '@/components/ui/EntityListCard';
import { cn } from '@/lib/utils';

const CTA_LABELS = ['Começar', 'Continuar', 'Continuar'];

// Réplicas estáticas dos cartões reais (GroupCard/TripCard/SplitCard) — mesmos
// primitivos do design system, sem interatividade, só para dar uma ideia real
// da UI em vez de um ícone genérico.

interface GroupPreviewCardProps {
    /** Quando o utilizador vem de um convite, mostramos o grupo real em vez
     *  do exemplo — nome e imagem já disponíveis no próprio fluxo de
     *  convite. Data e membros continuam mock (irrelevante aqui). */
    name?: string;
    avatarUrl?: string | null;
    emoji?: string;
    dateLabel?: string;
}

function GroupPreviewCard({
    name = 'Casa de férias',
    avatarUrl = null,
    emoji = '🏡',
    dateLabel = 'há 2 dias',
}: GroupPreviewCardProps) {
    const [imgFailed, setImgFailed] = useState(false);
    return (
        <div className={cn(entityListCardClassName, 'cursor-default')}>
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-100 dark:from-primary-900/40 dark:to-primary-900/30 flex items-center justify-center shrink-0 overflow-hidden">
                    {avatarUrl && !imgFailed ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={() => setImgFailed(true)}
                        />
                    ) : (
                        <span className="text-2xl leading-none">{emoji}</span>
                    )}
                </div>
                <EntityCardTitle className="text-xl leading-tight">{name}</EntityCardTitle>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <EntityMetaItem icon="schedule">{dateLabel}</EntityMetaItem>
            </div>

            <div className="flex items-center gap-2">
                <Avatar name="Miguel" size="xs" stacked />
                <Avatar name="Ana" size="xs" stacked className="-ml-2" />
                <Avatar name="Rui" size="xs" stacked className="-ml-2" />
                <span className="-ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[9px] font-bold text-primary-700 ring-2 ring-surface dark:bg-primary-900/50 dark:text-primary-300">
                    +3
                </span>
                <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 ml-1">
                    Ver 6 membros
                </span>
            </div>
        </div>
    );
}

function TripPreviewCard() {
    return (
        <div className={cn(entityListCardClassName, 'cursor-default')}>
            <div className="min-w-0">
                <EntityCardTitle>Compras de Domingo</EntityCardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-2">9 pessoas</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <EntityMetaItem icon="shopping_cart">3 pedidos · 35 itens</EntityMetaItem>
            </div>

            <div className="flex items-center justify-between gap-3">
                <EntityStatusPill variant="in_progress">Em compras</EntityStatusPill>
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-600 text-white shrink-0">
                    <Icon name="add" className="text-lg" />
                </span>
            </div>
        </div>
    );
}

function SplitPreviewCard() {
    return (
        <div className={cn(entityListCardClassName, 'cursor-default')}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <EntityCardTitle>Jantar do grupo</EntityCardTitle>
                    <div className="flex items-center gap-2 mt-2 min-w-0">
                        <Avatar name="Miguel" size="sm" />
                        <span className="text-sm text-[var(--text-secondary)] truncate">Miguel</span>
                    </div>
                </div>
                <EntityCardAsideTotal value={89.6} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <EntityMetaItem icon="receipt_long">5 itens</EntityMetaItem>
                <EntityMetaItem icon="groups">4 pessoas</EntityMetaItem>
            </div>
        </div>
    );
}

/** Ação de instalar, específica da plataforma — ocupa o mesmo lugar (fora do
 *  carrossel, por baixo dos pontos) onde estava o botão "Continuar" dos
 *  ecrãs anteriores, para a sequência ficar lógica. Android/desktop tem um
 *  botão a sério; iOS não tem prompt nativo, por isso mostra os passos
 *  manuais (`IosInstallSteps`, partilhado com o pedido de notificações). Em
 *  ambos os casos, "Concluir" fica por baixo para quem não quiser instalar
 *  agora. */
function InstallStep({ onFinish }: { onFinish: () => void }) {
    const { canInstall, iosManualInstall, isStandalone, inAppBrowser, platform, promptInstall } = useInstallPrompt();
    const [installing, setInstalling] = useState(false);
    const [justInstalled, setJustInstalled] = useState(false);

    const handleInstall = async () => {
        setInstalling(true);
        try {
            const outcome = await promptInstall();
            if (outcome === 'accepted') setJustInstalled(true);
        } finally {
            setInstalling(false);
        }
    };

    // O browser não expõe nenhuma API para abrir a app instalada a partir
    // desta aba normal (só o `beforeinstallprompt`/`appinstalled`, que já
    // usámos) — não há um "abrir app" real a mostrar aqui, por isso o mais
    // honesto é confirmar que instalou e dizer onde a encontrar.
    if (justInstalled) {
        return (
            <div className="w-full space-y-3">
                <div className="w-full flex items-center gap-3 rounded-full bg-success-bg text-success-fg px-4 h-13">
                    <Icon name="check_circle" className="text-lg shrink-0" />
                    <span className="text-sm font-semibold">
                        App instalada. Já a encontras no ecrã principal.
                    </span>
                </div>
                <Button block size="lg" variant="secondary" onClick={onFinish}>
                    Concluir
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full space-y-3">
            {!isStandalone && canInstall && (
                <Button block size="lg" loading={installing} onClick={handleInstall}>
                    Instalar aplicação
                    <Icon name="install_mobile" />
                </Button>
            )}

            {!isStandalone && iosManualInstall && <IosInstallSteps />}

            {/* Aberto dentro do WhatsApp/Instagram/etc.: daqui não se instala. */}
            {inAppBrowser && (
                <p className="w-full rounded-2xl bg-primary-50 dark:bg-primary-950 p-4 text-sm font-medium text-primary-700 dark:text-primary-200">
                    {platform === 'ios'
                        ? 'Para instalar, abre esta página no Safari: toca em ⋯ e escolhe "Abrir no Safari".'
                        : 'Para instalar, abre esta página no Chrome: toca em ⋮ e escolhe "Abrir no Chrome".'}
                </p>
            )}

            {isStandalone || (!canInstall && !iosManualInstall && !inAppBrowser) ? (
                <div className="h-13" aria-hidden="true" />
            ) : null}

            <Button block size="lg" variant="secondary" onClick={onFinish}>
                Concluir
            </Button>
        </div>
    );
}

export default function OnboardingPage() {
    const { push } = useAppNavigate();
    const { user, updateProfile } = useUser();
    const { isStandalone } = useInstallPrompt();
    const searchParams = useSearchParams();
    // Só caminhos internos — o valor vem do URL (ver `authRedirect.ts`).
    const redirect = safeRedirect(searchParams.get('redirect'));
    const trackRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollingProgrammatically = useRef(false);
    const [inviteGroup, setInviteGroup] = useState<GroupPreviewCardProps | null>(null);

    // Quem já usa a WPA instalada não precisa do ecrã de instalar — o 3º
    // ecrã passa a ser o último.
    const slideCount = isStandalone ? 3 : 4;
    const isLast = activeIndex === slideCount - 1;

    // Marca `onboarded` mal o utilizador chegue ao último ecrã, não só ao
    // clicar em "Concluir" — no ecrã de instalar (iOS) é normal seguir os
    // passos e fechar a aba sem voltar a tocar em nada aqui (a instalação
    // já aconteceu no ecrã principal). Sem isto, esse caso nunca marcava
    // `onboarded` e o carrossel voltava a aparecer do zero no próximo login.
    useEffect(() => {
        if (isLast && user?.id && !user.onboarded) {
            updateProfile({ onboarded: true }).catch(() => {});
        }
    }, [isLast, user?.id, user?.onboarded, updateProfile]);

    // Veio de um convite (profile-setup preserva o `redirect` original)?
    // Mostra o grupo real no 1º ecrã em vez do exemplo — já temos o nome e
    // a imagem no próprio fluxo de convite (`groupsApi.getByInviteCode`). E
    // junta o utilizador ao grupo já aqui, em segundo plano — não à espera
    // que ele volte a passar pelo `/invite/{code}` no fim: se a instalação
    // na WPA o obrigar a autenticar-se de novo (iOS/Android), a associação
    // ao grupo já está feita do lado do servidor e não se perde por causa
    // de um passo de login que ainda falta.
    useEffect(() => {
        const match = redirect?.match(/^\/invite\/([^/?]+)/);
        if (!match || !user?.id) return;
        const code = match[1];
        groupsApi.previewInvite(code).then((group) => {
            if (!group) return;
            setInviteGroup({
                name: group.name,
                avatarUrl: getGroupAvatarUrl(group.groupId, group.avatar),
                emoji: guessGroupEmoji(group.avatar),
                dateLabel: 'Hoje',
            });
            if (group.isMember) return;
            groupsApi.joinByInvite(code).catch((err) => {
                console.error('Auto-join (onboarding) failed:', err);
            });
        }).catch((err) => {
            console.error('Invite preview (onboarding) failed:', err);
        });
    }, [redirect, user?.id]);

    const finish = useCallback(() => {
        // "Saltar" pode ser clicado em qualquer ecrã, não só no último — o
        // `useEffect` do `isLast` não chega a correr nesse caso. Marca aqui
        // também (idempotente/otimista, `updateProfile` não rejeita).
        if (user?.id && !user.onboarded) {
            updateProfile({ onboarded: true }).catch(() => {});
        }
        push(redirect || '/groups');
    }, [push, redirect, user, updateProfile]);

    const goToIndex = useCallback((index: number) => {
        const track = trackRef.current;
        if (!track) return;
        scrollingProgrammatically.current = true;
        track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
        setActiveIndex(index);
        window.setTimeout(() => {
            scrollingProgrammatically.current = false;
        }, 400);
    }, []);

    // Sincroniza os pontos de paginação com o swipe manual do utilizador.
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        let raf = 0;
        const handleScroll = () => {
            if (scrollingProgrammatically.current) return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const index = Math.round(track.scrollLeft / track.clientWidth);
                setActiveIndex((prev) => (prev === index ? prev : index));
            });
        };
        track.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            track.removeEventListener('scroll', handleScroll);
            cancelAnimationFrame(raf);
        };
    }, []);

    return (
        // Altura fixa ao ecrã (não `min-h`): o carrossel ficava da altura do slide
        // mais alto e empurrava os botões para fora em ecrãs baixos.
        <div className="h-dvh bg-app flex flex-col safe-screen">
            <header className="flex items-center justify-between px-6 py-2 shrink-0">
                <div className="flex items-center gap-2">
                    <img src="/favicon.ico" alt="" className="w-8 h-8 rounded-lg" />
                    <span className="font-bold text-ink">Order It All!</span>
                </div>
                <button
                    type="button"
                    onClick={finish}
                    className="text-sm font-medium text-ink-soft hover:text-ink transition-colors px-2 py-1"
                >
                    Saltar
                </button>
            </header>

            <div
                ref={trackRef}
                className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
            >
                <div className="w-full flex-none snap-center flex flex-col items-center justify-center px-6 gap-6 short:gap-4 tiny:gap-3">
                    <div className="w-full max-w-sm">
                        <GroupPreviewCard {...inviteGroup} />
                    </div>
                    <div className="space-y-2 short:space-y-1 text-center max-w-sm">
                        <h1 className="text-2xl short:text-xl font-bold text-ink">
                            Comprar em grupo ficou mais simples
                        </h1>
                        <p className="text-ink-soft short:text-sm">
                            Cria grupos, junta os pedidos de todos e divide cada despesa de forma
                            justa.
                        </p>
                    </div>
                </div>

                <div className="w-full flex-none snap-center flex flex-col items-center justify-center px-6 gap-6 short:gap-4 tiny:gap-3">
                    <div className="w-full max-w-sm">
                        <TripPreviewCard />
                    </div>
                    <div className="space-y-2 short:space-y-1 text-center max-w-sm">
                        <h1 className="text-2xl short:text-xl font-bold text-ink">Faz pedidos durante a viagem</h1>
                        <p className="text-ink-soft short:text-sm">
                            Cada pessoa adiciona o que precisa e todos os pedidos ficam organizados
                            no mesmo lugar.
                        </p>
                    </div>
                </div>

                <div className="w-full flex-none snap-center flex flex-col items-center justify-center px-6 gap-6 short:gap-4 tiny:gap-3">
                    <div className="w-full max-w-sm">
                        <SplitPreviewCard />
                    </div>
                    <div className="space-y-2 short:space-y-1 text-center max-w-sm">
                        <h1 className="text-2xl short:text-xl font-bold text-ink">
                            Divide as despesas sem complicações
                        </h1>
                        <p className="text-ink-soft short:text-sm">
                            Usa Divisões para escolher quem participa. Cada pessoa paga apenas a
                            sua parte.
                        </p>
                    </div>
                </div>

                {!isStandalone && (
                    <div className="w-full flex-none snap-center flex flex-col items-center justify-center px-6 gap-5 short:gap-3 overflow-y-auto">
                        <div className="space-y-2 short:space-y-1 text-center max-w-sm">
                            <h1 className="text-2xl short:text-xl font-bold text-ink">A aplicação, sempre à mão</h1>
                            <p className="text-ink-soft short:text-sm">
                                Instala a aplicação para uma melhor experiência de utilização e para
                                receberes notificações dos teus pedidos e divisões.
                            </p>
                        </div>
                        <div className="w-full max-w-sm space-y-2">
                            <NotificationPreview
                                title="Pedido concluído"
                                body="O teu pedido em Casa de férias está pronto a levantar."
                            />
                            {/* Em ecrãs baixos (iPhone SE 1.ª geração) só cabe uma — no
                                iPhone ainda vêm os 3 passos de instalar por baixo. */}
                            <div className="tiny:hidden">
                                <NotificationPreview
                                    title="Nova despesa"
                                    body="Foste adicionado a Jantar do grupo. Deves 12,50 € ao Miguel."
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="px-6 pb-2 pt-1 shrink-0 space-y-4 short:space-y-2">
                <div className="flex items-center justify-center gap-2">
                    {Array.from({ length: slideCount }).map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            aria-label={`Ir para o ecrã ${i + 1}`}
                            onClick={() => goToIndex(i)}
                            className={cn(
                                'h-1.5 rounded-full transition-all',
                                i === activeIndex ? 'w-6 bg-primary-600' : 'w-1.5 bg-hairline-strong'
                            )}
                        />
                    ))}
                </div>

                {isLast && !isStandalone ? (
                    <InstallStep onFinish={finish} />
                ) : (
                    // O ecrã de instalar tem 2 blocos empilhados (instalar + Concluir) —
                    // este espaçador invisível, do mesmo tamanho de um botão, replica
                    // essa altura aqui para o botão principal cair sempre no mesmo
                    // nível em todos os ecrãs (ver [[onboarding-pwa-install]]). Serve
                    // tanto para os ecrãs intermédios como para o último quando já
                    // instalado (aí é só "Concluir" a fazer de conta que é o próximo).
                    <div className="space-y-3">
                        <Button
                            block
                            size="lg"
                            onClick={isLast ? finish : () => goToIndex(activeIndex + 1)}
                        >
                            {isLast ? 'Concluir' : CTA_LABELS[activeIndex]}
                            <Icon name="arrow_forward" />
                        </Button>
                        <div className="h-13" aria-hidden="true" />
                    </div>
                )}
            </div>
        </div>
    );
}
