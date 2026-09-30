'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/context/ToastContext';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { markNotificationPromptHandled } from '@/lib/notificationPromptState';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { NotificationPreview } from '@/components/features/NotificationPreview';
import { IosInstallSteps } from '@/components/features/IosInstallSteps';

interface OrderItemPreview {
    name: string;
    quantity: number;
}

interface NotificationInstallPromptProps {
    onClose: () => void;
    /** Item do pedido que o utilizador acabou de fazer (simplificado a 1,
     *  mesmo que tenha vários) — só usado na fase de instalar. Sem isto
     *  mostra-se um exemplo. */
    orderItem?: OrderItemPreview | null;
}

const MOCK_ITEM: OrderItemPreview = { name: 'Leite', quantity: 2 };

type Stage = 'install' | 'permission';

/**
 * Ecrã inteiro (mesmo estilo do onboarding) com até 2 fases, na mesma
 * sessão de overlay:
 *
 * 1. **Instalar** — só quando há mesmo instalação por fazer (iOS sem WPA,
 *    ou Android/desktop com `beforeinstallprompt` guardado). No Android a
 *    instalação e a permissão partilham o mesmo armazenamento (ao
 *    contrário do iOS) — por isso, mal instala com sucesso, transita
 *    **na mesma sessão** para a fase 2, sem precisar de reabrir a app.
 *    No iOS não há instalação programática — mostra os 3 passos manuais,
 *    e a permissão só se pede depois, quando ele voltar a entrar já pela
 *    WPA (outro disparo deste mesmo componente, já sem nada para
 *    instalar).
 * 2. **Permissão** — pede `Notification.requestPermission()` a sério.
 *
 * Dispensar a fase de instalar ("Talvez mais tarde") **não** marca como
 * tratado — a app pode voltar a oferecer mais tarde, quando ele já
 * estiver a usar a WPA. Só dispensar/decidir a fase de permissão é que
 * marca como tratado para sempre (`markNotificationPromptHandled`).
 *
 * Chamado a partir de 2 sítios: mesmo depois de criar um pedido
 * (`trips/[tripId]/page.tsx`, com o item real) e à entrada em `/groups`
 * (apanha quem acabou de instalar e voltou à app, ou quem só criou um
 * grupo/viagem sem alguma vez ter feito um pedido).
 */
export function NotificationInstallPrompt({ onClose, orderItem }: NotificationInstallPromptProps) {
    const { iosManualInstall, canInstall, promptInstall } = useInstallPrompt();
    const { requestPermission } = useNotificationPermission();
    const { showToast } = useToast();
    const [installing, setInstalling] = useState(false);
    const [enabling, setEnabling] = useState(false);
    const [stage, setStage] = useState<Stage>(
        iosManualInstall || canInstall ? 'install' : 'permission',
    );

    // Portal para o `document.body`: renderizado a partir de sítios como
    // `trips/[tripId]/page.tsx`, onde algum antepassado (transições de
    // página/animações) cria um containing block para `position: fixed` —
    // sem o portal isto ficava preso lá dentro em vez de cobrir o ecrã
    // todo (mesmo problema que o `Sheet.tsx` já resolve assim).
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Nada para fazer: já instalado (ou sem instalação disponível) e a
    // permissão já foi decidida — não há fase de instalar nem nada para
    // pedir. Fecha sem incomodar.
    useEffect(() => {
        if (!mounted || stage !== 'permission') return;
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'default') {
            markNotificationPromptHandled();
            onClose();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mounted, stage]);

    const item = orderItem ?? MOCK_ITEM;

    const handleDismissInstall = () => {
        // Sem marcar "tratado" — quando ele entrar como WPA instalada, o
        // gatilho em `/groups` volta a oferecer (já só a fase de permissão,
        // já não há instalação para propor).
        onClose();
    };

    const handleDismissPermission = () => {
        markNotificationPromptHandled();
        onClose();
    };

    const handleAndroidInstall = async () => {
        setInstalling(true);
        try {
            const outcome = await promptInstall();
            if (outcome === 'accepted') {
                // Mesma origem, mesmo armazenamento — a permissão de
                // notificações é comum ao browser e à WPA no Android, por
                // isso pede-se já aqui, sem precisar de reabrir nada.
                setStage('permission');
            }
        } finally {
            setInstalling(false);
        }
    };

    const handleEnable = async () => {
        setEnabling(true);
        try {
            const permission = await requestPermission();
            if (permission === 'granted') {
                showToast('Notificações ativadas', 'success');
            }
        } catch {
            showToast('Não foi possível ativar notificações', 'error');
        } finally {
            setEnabling(false);
            markNotificationPromptHandled();
            onClose();
        }
    };

    if (!mounted) return null;

    const content =
        stage === 'install' ? (
            <div className="fixed inset-0 z-[100] bg-app flex flex-col safe-screen animate-fade-in-up">
                <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 overflow-y-auto">
                    <div className="space-y-2 text-center max-w-sm">
                        <h1 className="text-2xl font-bold text-ink">Está a par do teu pedido!</h1>
                        <p className="text-ink-soft">
                            Para receberes notificações quando o teu pedido estiver completo,
                            instala a aplicação.
                        </p>
                    </div>

                    <div className="w-full max-w-sm flex items-center gap-3 rounded-2xl bg-surface border border-hairline shadow-sm p-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-950 flex items-center justify-center shrink-0">
                            <Icon
                                name="shopping_cart"
                                className="text-lg text-primary-700 dark:text-primary-200"
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-ink text-sm truncate">{item.name}</p>
                            <p className="text-sm text-ink-soft">{item.quantity}x</p>
                        </div>
                    </div>

                    {iosManualInstall && (
                        <div className="w-full max-w-sm">
                            <IosInstallSteps />
                        </div>
                    )}
                </div>

                <div className="px-6 pb-2 pt-1 shrink-0 space-y-3">
                    {canInstall && (
                        <Button block size="lg" loading={installing} onClick={handleAndroidInstall}>
                            Instalar aplicação
                            <Icon name="install_mobile" />
                        </Button>
                    )}
                    <Button block size="lg" variant="ghost" onClick={handleDismissInstall}>
                        Talvez mais tarde
                    </Button>
                </div>
            </div>
        ) : (
            <div className="fixed inset-0 z-[100] bg-app flex flex-col safe-screen animate-fade-in-up">
                <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 overflow-y-auto">
                    <div className="space-y-2 text-center max-w-sm">
                        <h1 className="text-2xl font-bold text-ink">Nunca percas uma viagem!</h1>
                        <p className="text-ink-soft">
                            Ativa as notificações para estares a par dos teus pedidos e divisões.
                        </p>
                    </div>
                    <div className="w-full max-w-sm space-y-2">
                        <NotificationPreview
                            title="Pedido concluído"
                            body="O teu pedido em Casa de férias está pronto a levantar."
                        />
                        <NotificationPreview
                            title="Nova despesa"
                            body="Foste adicionado a Jantar do grupo. Deves 12,50 € ao Miguel."
                        />
                    </div>
                </div>

                <div className="px-6 pb-2 pt-1 shrink-0 space-y-3">
                    <Button block size="lg" loading={enabling} onClick={handleEnable}>
                        Ativar notificações
                        <Icon name="notifications_active" />
                    </Button>
                    <Button block size="lg" variant="ghost" onClick={handleDismissPermission}>
                        Talvez mais tarde
                    </Button>
                </div>
            </div>
        );

    return createPortal(content, document.body);
}
