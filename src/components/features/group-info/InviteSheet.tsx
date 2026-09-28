'use client';

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { SettingsRow, SettingsSection } from '@/components/ui/SettingsList';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { copyText } from '@/lib/clipboard';
import { groupsApi } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';

export function inviteUrlFor(group: Pick<Group, 'invite_code'>, placeholderId?: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const base = `${origin}/invite/${group.invite_code}`;
    // Convite pessoal (Fase B): quem entra por este link fica logo como esta
    // pessoa sem conta. Até lá, é um convite normal.
    return placeholderId ? `${base}?como=${placeholderId}` : base;
}

/** Partilha um convite pelo menu do sistema (WhatsApp…), ou copia a mensagem. */
export async function shareInvite(
    { title, text }: { title: string; text: string },
    showToast: (m: string, t: 'success' | 'error') => void,
): Promise<void> {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share({ title, text });
            return;
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
        }
    }
    if (await copyText(text)) showToast('Mensagem copiada — cola no WhatsApp ou onde quiseres', 'success');
    else showToast('Não foi possível partilhar', 'error');
}

/** "Convidar pessoas" — o link do grupo para partilhar; os admins controlam
 *  também se o link está ativo e podem gerar um novo. */
export function InviteSheet({
    isOpen,
    onClose,
    group,
    isAdmin,
    onChanged,
}: {
    isOpen: boolean;
    onClose: () => void;
    group: Group;
    isAdmin: boolean;
    onChanged: () => void;
}) {
    const { showToast } = useToast();
    const confirmAction = useConfirm();
    const url = inviteUrlFor(group);
    const active = !!group.invite_active;

    const share = () =>
        shareInvite(
            {
                title: `Convite — ${group.name}`,
                text: `Junta-te ao grupo ${group.name} no Order It — combinamos as compras e acertamos as contas lá: ${url}`,
            },
            showToast,
        );

    const toggle = async (on: boolean) => {
        try {
            await groupsApi.toggleInvite(group.id, on);
            onChanged();
        } catch {
            showToast('Erro ao alterar o convite', 'error');
        }
    };

    const regenerate = async () => {
        if (
            !(await confirmAction({
                title: 'Gerar um link novo?',
                description: 'O link atual deixa de funcionar para quem ainda não entrou.',
                tone: 'warning',
                confirmLabel: 'Gerar link novo',
            }))
        )
            return;
        try {
            await groupsApi.regenerateInviteCode(group.id);
            showToast('Link novo gerado', 'success');
            onChanged();
        } catch {
            showToast('Erro ao gerar o link', 'error');
        }
    };

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title="Convidar pessoas"
            size="auto"
            footer={
                active ? (
                    <Button size="lg" block onClick={share}>
                        Partilhar convite
                    </Button>
                ) : undefined
            }
        >
            <div className="space-y-5">
                {active ? (
                    <>
                        <p className="text-sm text-ink-soft">Quem abrir o link entra no grupo — com conta ou criando uma.</p>
                        <SettingsSection>
                            <SettingsRow
                                icon="link"
                                label={<span className="block truncate text-ink-soft font-normal">{url.replace(/^https?:\/\//, '')}</span>}
                                trailing={<span className="text-sm font-semibold text-primary-600 dark:text-primary-300">Copiar</span>}
                                onClick={() =>
                                    void copyText(url).then((ok) =>
                                        ok ? showToast('Link copiado', 'success') : showToast('Não foi possível copiar', 'error'),
                                    )
                                }
                            />
                        </SettingsSection>
                    </>
                ) : (
                    <p className="text-sm text-ink-soft">
                        {isAdmin ? 'O link de convite está desligado — liga-o para partilhar.' : 'Os convites estão desligados por um administrador.'}
                    </p>
                )}

                {isAdmin && (
                    <SettingsSection footer="Desligar impede novas entradas pelo link; quem já está no grupo continua.">
                        <SettingsRow
                            icon="link"
                            label="Link de convite ativo"
                            trailing={<Switch checked={active} onChange={toggle} label="Link de convite ativo" />}
                        />
                        {active && <SettingsRow icon="refresh" label="Gerar link novo" tone="brand" onClick={regenerate} />}
                    </SettingsSection>
                )}
            </div>
        </Sheet>
    );
}
