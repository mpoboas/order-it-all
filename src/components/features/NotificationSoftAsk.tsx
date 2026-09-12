'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

const DISMISS_KEY = 'notif-soft-ask-dismissed';

/**
 * Soft-ask (Fase 1 do plano de notificações — ver memória `notificacoes-push`):
 * explica o valor ANTES de gastar o prompt nativo do browser, que só se pode
 * mostrar uma vez por origem — uma recusa aí é praticamente permanente. Só o
 * toque em "Ativar" chama `Notification.requestPermission()`.
 *
 * Fica em `/groups` (ecrã que toda a gente visita a seguir ao login).
 * Desaparece assim que a permissão deixa de ser `default` (concedida,
 * recusada, ou não suportada) ou se o utilizador a dispensar — sem repetir.
 */
export function NotificationSoftAsk() {
    const { status, iosNeedsInstall, requestPermission } = useNotificationPermission();
    const { showToast } = useToast();
    const [dismissed, setDismissed] = useState(true); // true até ler o localStorage — evita flash
    const [enabling, setEnabling] = useState(false);

    useEffect(() => {
        try {
            setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
        } catch {
            setDismissed(false);
        }
    }, []);

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            /* ignore */
        }
        setDismissed(true);
    };

    if (status !== 'default' || dismissed) return null;

    const handleEnable = async () => {
        if (iosNeedsInstall) {
            showToast('Instala a app no ecrã principal: Partilhar → Adicionar ao Ecrã Principal', 'info');
            return;
        }
        setEnabling(true);
        try {
            const permission = await requestPermission();
            if (permission === 'granted') {
                showToast('Notificações ativadas', 'success');
                dismiss();
            } else if (permission === 'denied') {
                dismiss();
            }
        } catch {
            showToast('Não foi possível ativar notificações', 'error');
        } finally {
            setEnabling(false);
        }
    };

    return (
        <div className="card relative p-4 bg-surface border border-hairline animate-fade-in-up">
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dispensar"
                className="absolute top-3 right-3 p-1.5 text-ink-faint hover:text-ink hover:bg-surface-sunken rounded-full transition-colors"
            >
                <Icon name="close" className="text-lg" />
            </button>
            <div className="flex items-start gap-3 pr-8">
                <div className="w-10 h-10 rounded-xl bg-info-bg text-info-fg flex items-center justify-center shrink-0">
                    <Icon name={iosNeedsInstall ? 'phone_iphone' : 'notifications'} className="text-2xl" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">Recebe um aviso quando há novidades</p>
                    <p className="text-sm text-ink-soft mt-0.5">
                        {iosNeedsInstall
                            ? 'Instala a app no ecrã principal para poderes ativar notificações.'
                            : 'Sabe logo quando há uma viagem nova, quando fecha a pedidos, ou quando termina.'}
                    </p>
                    <Button
                        size="sm"
                        variant={iosNeedsInstall ? 'secondary' : 'primary'}
                        className="mt-3"
                        loading={enabling}
                        onClick={handleEnable}
                    >
                        {iosNeedsInstall ? 'Como instalar' : 'Ativar notificações'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
