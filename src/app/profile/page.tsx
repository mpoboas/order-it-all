'use client';

import { useState, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { Header } from '@/components/layout/Header';
import { BrandBand } from '@/components/layout/BrandBand';
import { Avatar } from '@/components/ui/Avatar';
import { cn, getUserGeminiApiKey, maskSecret } from '@/lib/utils';
import { normalizeRevtag } from '@/lib/paymentLinks';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { isValidUsername } from '@/lib/username';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { EditFieldSheet } from '@/components/features/EditFieldSheet';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { IosInstallSteps } from '@/components/features/IosInstallSteps';
import { Sheet } from '@/components/ui/Sheet';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';

/** Linha de resumo (ícone + rótulo + valor atual) — toca para abrir o ecrã
 *  "dinâmico" de edição (`EditFieldSheet`, Fase 9). */
function SummaryRow({
    icon, label, value, placeholder, onClick, prefix,
}: {
    icon: IconName;
    label: string;
    value: string;
    placeholder: string;
    onClick: () => void;
    prefix?: string;
}) {
    return (
        <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors">
            <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300 flex items-center justify-center shrink-0">
                <Icon name={icon} className="text-lg" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">{label}</p>
                <p className={cn('text-ink truncate', !value && 'text-ink-faint')}>
                    {value ? `${prefix ?? ''}${value}` : placeholder}
                </p>
            </div>
            <Icon name="chevron_right" className="text-ink-faint shrink-0" />
        </button>
    );
}

type EditingField = 'name' | 'username' | 'mbway' | 'revolut' | 'gemini' | null;

export default function ProfilePage() {
    const { user, updateProfile, logout } = useUser();
    const { theme, toggleTheme } = useTheme();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [editingField, setEditingField] = useState<EditingField>(null);
    const { status: notifStatus, iosNeedsInstall, requestPermission } = useNotificationPermission();
    const [enablingNotifs, setEnablingNotifs] = useState(false);
    // Instalar a app — sempre à mão no Perfil (padrão das WPAs), além dos
    // pedidos contextuais do onboarding/notificações. Some quando já está
    // instalada ou o browser não permite (ex.: Firefox desktop).
    const { canInstall, iosManualInstall, isStandalone, promptInstall } = useInstallPrompt();
    const [showIosInstall, setShowIosInstall] = useState(false);
    const showInstallRow = !isStandalone && (canInstall || iosManualInstall);

    const currentGeminiKey = getUserGeminiApiKey(user) ?? '';
    const hasGeminiKey = Boolean(currentGeminiKey);

    const handleEnableNotifications = async () => {
        if (iosNeedsInstall) {
            showToast('Instala a app no ecrã principal: Partilhar → Adicionar ao Ecrã Principal', 'info');
            return;
        }
        setEnablingNotifs(true);
        try {
            const permission = await requestPermission();
            if (permission === 'granted') {
                showToast('Notificações ativadas', 'success');
            } else if (permission === 'denied') {
                showToast('Permissão recusada — ativa nas definições do navegador', 'error');
            }
        } catch {
            showToast('Não foi possível ativar notificações', 'error');
        } finally {
            setEnablingNotifs(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast('A imagem deve ter menos de 5MB', 'error');
            return;
        }

        setIsLoading(true);
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            await updateProfile(formData);
        } catch (error) {
            console.error(error);
            showToast('Erro ao atualizar foto', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        void logout();
    };

    if (!user) {
        return <div className="min-h-screen bg-app flex items-center justify-center">
            <LoadingSpinner />
        </div>;
    }

    return (
        <div className="min-h-screen bg-app pb-20 transition-colors has-bottom-nav">
            <Header
                title="Order It All!"
                icon={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src="/favicon.svg"
                        alt=""
                        className="w-full h-full object-contain p-1"
                    />
                }
            />

            <BrandBand>
                {/* Cabeçalho — avatar + nome + email, na faixa da marca. */}
                <div className="flex items-center gap-4 px-1">
                    <div className="relative shrink-0 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="relative w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/60">
                            {isLoading ? (
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                                    <LoadingSpinner size="sm" />
                                </div>
                            ) : (
                                <Avatar
                                    name={user.name || user.email}
                                    src={getUserAvatarUrl(user.id, user.avatar)}
                                    size="lg"
                                    className="w-full h-full text-xl"
                                />
                            )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white text-primary-600 ring-2 ring-white/60 flex items-center justify-center">
                            <Icon name="photo_camera" className="text-[13px]" />
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold text-ink truncate">{user.name || 'Sem nome'}</h2>
                        <p className="text-sm text-ink-faint truncate">{user.email}</p>
                        {user.username && <p className="text-sm text-ink-faint truncate">@{user.username}</p>}
                    </div>
                </div>
            </BrandBand>

            <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
                {/* Perfil */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-ink-faint uppercase tracking-wider ml-1">Perfil</h3>
                    <div className="card divide-y divide-hairline overflow-hidden bg-surface border border-hairline">
                        <SummaryRow
                            icon="person"
                            label="Nome de exibição"
                            value={user.name || ''}
                            placeholder="Definir nome"
                            onClick={() => setEditingField('name')}
                        />
                        <SummaryRow
                            icon="alternate_email"
                            label="Username"
                            value={user.username || ''}
                            placeholder="Definir username"
                            prefix="@"
                            onClick={() => setEditingField('username')}
                        />
                    </div>
                </div>

                {/* Pagamentos */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-ink-faint uppercase tracking-wider ml-1">Pagamentos</h3>
                    <div className="card divide-y divide-hairline overflow-hidden bg-surface border border-hairline">
                        <SummaryRow
                            icon="phone_iphone"
                            label="Número MB WAY"
                            value={user.mbway_phone || ''}
                            placeholder="Adicionar número"
                            onClick={() => setEditingField('mbway')}
                        />
                        <SummaryRow
                            icon="credit_card"
                            label="Revolut"
                            value={user.revtag || ''}
                            placeholder="Adicionar revtag"
                            prefix="@"
                            onClick={() => setEditingField('revolut')}
                        />
                    </div>
                </div>

                {/* Preferências */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-ink-faint uppercase tracking-wider ml-1">Preferências</h3>
                    <div className="card divide-y divide-hairline overflow-hidden bg-surface border border-hairline">
                        {showInstallRow && (
                            <SummaryRow
                                icon="install_mobile"
                                label="App"
                                value="Instalar no ecrã principal"
                                placeholder="Instalar no ecrã principal"
                                onClick={() => {
                                    if (iosManualInstall) setShowIosInstall(true);
                                    else void promptInstall();
                                }}
                            />
                        )}
                        {notifStatus !== 'unsupported' && (
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                    notifStatus === 'granted'
                                        ? "bg-success-bg text-success-fg"
                                        : "bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300"
                                )}>
                                    <Icon
                                        name={
                                            notifStatus === 'granted'
                                                ? 'notifications_active'
                                                : notifStatus === 'denied'
                                                    ? 'notifications_off'
                                                    : iosNeedsInstall
                                                        ? 'phone_iphone'
                                                        : 'notifications'
                                        }
                                        className="text-lg"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-ink text-sm">Notificações</p>
                                    <p className="text-xs text-ink-faint">
                                        {notifStatus === 'granted' && 'Ativas neste dispositivo'}
                                        {notifStatus === 'denied' && 'Bloqueadas — ativa nas definições do navegador'}
                                        {notifStatus === 'default' && iosNeedsInstall && 'Instala no ecrã principal para ativar'}
                                        {notifStatus === 'default' && !iosNeedsInstall && 'Recebe um aviso quando há viagens novas'}
                                    </p>
                                </div>
                                {notifStatus === 'default' && (
                                    <Button
                                        size="sm"
                                        variant={iosNeedsInstall ? 'secondary' : 'primary'}
                                        loading={enablingNotifs}
                                        onClick={handleEnableNotifications}
                                    >
                                        {iosNeedsInstall ? 'Como instalar' : 'Ativar'}
                                    </Button>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={toggleTheme}>
                            <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                theme === 'dark'
                                    ? "bg-surface-sunken text-primary-300"
                                    : "bg-warning-bg text-warning-fg"
                            )}>
                                <Icon name={theme === 'dark' ? 'dark_mode' : 'light_mode'} className="text-lg" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-ink text-sm">Tema escuro</p>
                                <p className="text-xs text-ink-faint">Alternar entre claro e escuro</p>
                            </div>
                            <div className={cn(
                                "w-11 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out relative shrink-0",
                                theme === 'dark' ? "bg-primary-600" : "bg-hairline-strong"
                            )}>
                                <div className={cn(
                                    "w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out",
                                    theme === 'dark' ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Avançado — só para quem já tem uma chave Gemini definida (scan de faturas). */}
                {hasGeminiKey && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-bold text-ink-faint uppercase tracking-wider ml-1">Avançado</h3>
                        <div className="card divide-y divide-hairline overflow-hidden bg-surface border border-hairline">
                            <SummaryRow
                                icon="key"
                                label="Chave API Gemini"
                                value={maskSecret(currentGeminiKey)}
                                placeholder="Definir chave"
                                onClick={() => setEditingField('gemini')}
                            />
                        </div>
                    </div>
                )}

                {/* Terminar sessão */}
                <button
                    onClick={handleLogout}
                    className="w-full h-12 rounded-full text-danger-fg font-semibold bg-surface hover:bg-danger-bg transition-colors border border-danger-fg/25 flex items-center justify-center gap-2"
                >
                    <Icon name="logout" className="text-xl" />
                    Terminar Sessão
                </button>

                <div className="text-center">
                    <p className="text-xs text-ink-faint">Versão 1.0.0 • Order It All!</p>
                </div>
            </div>
            <GlobalBottomNav />

            <EditFieldSheet
                isOpen={editingField === 'name'}
                onClose={() => setEditingField(null)}
                label="Nome de exibição"
                value={user.name || ''}
                placeholder="O teu nome"
                onSave={(value) => updateProfile({ name: value })}
                validate={(value) => (!value ? 'O nome não pode ficar vazio.' : null)}
            />
            <EditFieldSheet
                isOpen={editingField === 'username'}
                onClose={() => setEditingField(null)}
                label="Username"
                value={user.username || ''}
                placeholder="username"
                prefix="@"
                onSave={(value) => updateProfile({ username: value.toLowerCase() })}
                validate={(value) => {
                    const v = value.toLowerCase();
                    return isValidUsername(v) ? null : '3-20 letras minúsculas, números, "_" ou "." — sem ponto a abrir/fechar.';
                }}
                parseError={(err) => {
                    const fieldError = (err as { response?: { data?: { username?: unknown } } })?.response?.data?.username;
                    return fieldError ? 'Esse username já está a ser usado.' : 'Erro ao atualizar username';
                }}
            />
            <EditFieldSheet
                isOpen={editingField === 'mbway'}
                onClose={() => setEditingField(null)}
                label="Número MB WAY"
                value={user.mbway_phone || ''}
                placeholder="912 345 678"
                type="tel"
                onSave={(value) => updateProfile({ mbway_phone: value })}
                helper="Mostrado a quem tiver de te pagar, para copiar e pagar fora da app."
            />
            <Sheet isOpen={showIosInstall} onClose={() => setShowIosInstall(false)} title="Instalar a app" size="auto">
                <IosInstallSteps />
            </Sheet>
            <EditFieldSheet
                isOpen={editingField === 'revolut'}
                onClose={() => setEditingField(null)}
                label="Revtag do Revolut"
                value={user.revtag || ''}
                placeholder="revtag"
                prefix="@"
                onSave={(value) => updateProfile({ revtag: normalizeRevtag(value).toLowerCase() })}
                validate={(value) => {
                    const v = normalizeRevtag(value);
                    return v === '' || /^[a-zA-Z0-9._-]{2,40}$/.test(v)
                        ? null
                        : 'Só letras, números, "_", "-" ou "." — sem espaços.';
                }}
                helper="Quem te dever pode pagar-te pelo Revolut com o valor já preenchido. Encontras a tua revtag no perfil da app do Revolut."
            />
            <EditFieldSheet
                isOpen={editingField === 'gemini'}
                onClose={() => setEditingField(null)}
                label="Chave API Gemini"
                value={currentGeminiKey}
                placeholder="A tua chave…"
                onSave={(value) => updateProfile({ geminiApiKey: value })}
                validate={(value) => (!value ? 'A chave não pode ficar vazia.' : null)}
                helper={
                    <>
                        Usada para ler faturas. Cria uma nova em{' '}
                        <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 dark:text-primary-400 underline"
                        >
                            aistudio.google.com
                        </a>
                        .
                    </>
                }
            />
        </div>
    );
}
