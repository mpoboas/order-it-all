'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/context/ToastContext';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import {
    markNotificationPromptDone,
    snoozeNotificationPrompt,
    type NotificationPromptStage,
} from '@/lib/notificationPromptState';
import { openInSystemBrowser } from '@/lib/oauthBrowser';
import { formatEUR } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { NotificationPreview } from '@/components/features/NotificationPreview';
import { IosInstallSteps } from '@/components/features/IosInstallSteps';

interface OrderItemPreview {
    name: string;
    quantity: number;
}

interface NotificationInstallPromptProps {
    /** Fase por onde começar — decidida por `notificationPromptStage()`. */
    stage: NotificationPromptStage;
    onClose: () => void;
    /** Item do pedido que o utilizador acabou de fazer — dá contexto ao texto
     *  quando o pedido aparece logo a seguir a pedir numa viagem. */
    orderItem?: OrderItemPreview | null;
}

/**
 * Ecrã inteiro que leva o utilizador até às notificações ativas, com as fases
 * que ESTE dispositivo precisar (ver `notificationPromptStage`):
 *
 * 1. **Abrir no browser** — dentro do WhatsApp/Instagram/etc. não há
 *    instalação nem push. Android abre direto no Chrome; iPhone explica.
 * 2. **Instalar** — iPhone fora da app (passos manuais; a permissão só se pode
 *    pedir já dentro da app instalada, que tem armazenamento próprio, por isso
 *    este mesmo ecrã volta a aparecer lá, já na fase 3) ou Android/desktop
 *    com o `beforeinstallprompt` guardado (mesma origem e armazenamento: passa
 *    logo à fase 3, na mesma sessão).
 * 3. **Permissão** — `Notification.requestPermission()` a sério.
 *
 * "Talvez mais tarde" adia (`snoozeNotificationPrompt`); decidir no pedido do
 * sistema termina o assunto (`markNotificationPromptDone`).
 */
export function NotificationInstallPrompt({ stage: initialStage, onClose, orderItem }: NotificationInstallPromptProps) {
    const { iosManualInstall, canInstall, platform, promptInstall } = useInstallPrompt();
    const { requestPermission, support } = useNotificationPermission();
    const { showToast } = useToast();
    const [installing, setInstalling] = useState(false);
    const [enabling, setEnabling] = useState(false);
    const [stage, setStage] = useState<NotificationPromptStage>(initialStage);

    // Portal para o `document.body`: renderizado a partir de sítios como
    // `trips/[tripId]/page.tsx`, onde algum antepassado (transições de
    // página/animações) cria um containing block para `position: fixed` —
    // sem o portal isto ficava preso lá dentro em vez de cobrir o ecrã
    // todo (mesmo problema que o `Sheet.tsx` já resolve assim).
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const later = () => {
        snoozeNotificationPrompt();
        onClose();
    };

    const handleInstall = async () => {
        setInstalling(true);
        try {
            const outcome = await promptInstall();
            if (outcome !== 'accepted') return;
            // Android/desktop: mesma origem, mesmo armazenamento — a permissão
            // pede-se já aqui, sem reabrir nada. Se não houver push (ou já
            // estiver decidida), acabou.
            if (support.pushCapable && Notification.permission === 'default') setStage('permission');
            else {
                showToast('App instalada', 'success');
                onClose();
            }
        } finally {
            setInstalling(false);
        }
    };

    const handleEnable = async () => {
        setEnabling(true);
        try {
            const { permission, subscribed } = await requestPermission();
            markNotificationPromptDone();
            if (permission === 'granted' && subscribed) showToast('Notificações ativadas', 'success');
            else if (permission === 'granted') {
                showToast('Não foi possível ligar este dispositivo. Tenta outra vez no Perfil.', 'error');
            } else if (permission === 'denied') {
                showToast('Notificações bloqueadas. Podes ativá-las no Perfil.', 'info');
            }
        } catch {
            showToast('Não foi possível ativar as notificações', 'error');
        } finally {
            setEnabling(false);
            onClose();
        }
    };

    const openInBrowser = async () => {
        if (platform === 'android') {
            openInSystemBrowser(window.location.href);
            return;
        }
        try {
            await navigator.clipboard.writeText(window.location.origin);
            showToast('Link copiado. Cola-o no Safari.', 'success');
        } catch {
            showToast('Não foi possível copiar o link', 'error');
        }
    };

    if (!mounted) return null;

    const context = orderItem
        ? `Para saberes quando o teu pedido (${orderItem.quantity}x ${orderItem.name}) for comprado`
        : 'Para saberes quando há uma despesa nova, alguém te paga ou abre uma viagem';

    let body: ReactNode;
    let actions: ReactNode;

    if (stage === 'open-in-browser') {
        body = (
            <Intro
                title="Abre no teu browser"
                text={
                    platform === 'ios'
                        ? `${context}, a app tem de estar no ecrã principal, e isso só dá a partir do Safari. Toca em ⋯ e escolhe "Abrir no Safari", ou copia o link.`
                        : `${context}, abre a app no Chrome e instala-a. Aqui dentro não dá.`
                }
            />
        );
        actions = (
            <Button block size="lg" onClick={openInBrowser}>
                {platform === 'android' ? 'Abrir no Chrome' : 'Copiar link'}
                <Icon name={platform === 'android' ? 'open_in_new' : 'content_copy'} />
            </Button>
        );
    } else if (stage === 'install') {
        body = (
            <>
                <Intro
                    title="Instala a app"
                    text={
                        iosManualInstall
                            ? `${context}, a app tem de estar no ecrã principal. No iPhone, as notificações só funcionam assim.`
                            : `${context}, instala a app. Fica no ecrã principal, como as outras.`
                    }
                />
                {iosManualInstall && (
                    <div className="w-full max-w-sm">
                        <IosInstallSteps />
                    </div>
                )}
            </>
        );
        actions = canInstall ? (
            <Button block size="lg" loading={installing} onClick={handleInstall}>
                Instalar aplicação
                <Icon name="install_mobile" />
            </Button>
        ) : null;
    } else {
        body = (
            <>
                <Intro
                    title="Não percas nada do grupo"
                    text={
                        orderItem
                            ? `Ativa as notificações ${context.charAt(0).toLowerCase() + context.slice(1)} e para as despesas e pagamentos do grupo.`
                            : 'Ativa as notificações para saberes quando há uma despesa nova, alguém te paga ou abre uma viagem.'
                    }
                />
                <div className="w-full max-w-sm space-y-2">
                    <NotificationPreview title="💰 Nova despesa" body={`Miguel adicionou "Jantar de sexta" (${formatEUR(37.5)}).`} />
                    <NotificationPreview title="🛍️ Está na hora de encomendar!" body="Continente de sábado está disponível. Faz os teus pedidos!" />
                </div>
            </>
        );
        actions = (
            <Button block size="lg" loading={enabling} onClick={handleEnable}>
                Ativar notificações
                <Icon name="notifications_active" />
            </Button>
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-app flex flex-col safe-screen animate-fade-in-up">
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 short:gap-3 overflow-y-auto">{body}</div>
            <div className="px-6 pb-2 pt-1 shrink-0 space-y-3 short:space-y-2">
                {actions}
                <Button block size="lg" variant="ghost" onClick={later}>
                    Talvez mais tarde
                </Button>
            </div>
        </div>,
        document.body,
    );
}

function Intro({ title, text }: { title: string; text: string }) {
    return (
        <div className="space-y-2 text-center max-w-sm">
            <h1 className="text-2xl short:text-xl font-bold text-ink">{title}</h1>
            <p className="text-ink-soft short:text-sm">{text}</p>
        </div>
    );
}
