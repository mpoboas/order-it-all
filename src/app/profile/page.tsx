'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { Header } from '@/components/layout/Header';
import { Avatar } from '@/components/ui/Avatar';
import { cn, getUserGeminiApiKey } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';

export default function ProfilePage() {
    const { user, updateProfile, logout } = useUser();
    const { theme, toggleTheme } = useTheme();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [geminiKeyInput, setGeminiKeyInput] = useState('');
    const [isSavingKey, setIsSavingKey] = useState(false);

    const currentGeminiKey = getUserGeminiApiKey(user) ?? '';
    const hasGeminiKey = Boolean(currentGeminiKey);

    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setGeminiKeyInput(getUserGeminiApiKey(user) ?? '');
        }
    }, [user]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (e.g. 5MB)
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

    const handleSaveName = async () => {
        if (!name.trim()) return;
        if (name === user?.name) return;

        setIsSaving(true);
        try {
            await updateProfile({ name });
        } catch (error) {
            console.error(error);
            showToast('Erro ao atualizar nome', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveGeminiKey = async () => {
        const key = geminiKeyInput.trim();
        if (!key || key === currentGeminiKey) return;
        setIsSavingKey(true);
        try {
            await updateProfile({ geminiApiKey: key });
        } catch (error) {
            console.error(error);
            showToast('Erro ao atualizar chave', 'error');
        } finally {
            setIsSavingKey(false);
        }
    };

    const handleLogout = () => {
        logout();
        // Router push is handled in context but being safe
    };

    if (!user) {
        return <div className="min-h-screen bg-app flex items-center justify-center">
            <LoadingSpinner />
        </div>;
    }

    return (
        <div className="min-h-screen bg-app pb-20 transition-colors">
            <Header title="Meu Perfil" showBack />

            <div className="max-w-md mx-auto px-4 pt-6 space-y-6">

                {/* Profile Card */}
                <div className="card p-6 flex flex-col items-center bg-surface border border-hairline shadow-sm">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="relative w-24 h-24 rounded-full overflow-hidden ring-4 ring-hairline transition group-hover:ring-primary-100 dark:group-hover:ring-primary-900/30">
                            {isLoading ? (
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                                    <LoadingSpinner size="sm" />
                                </div>
                            ) : (
                                <Avatar
                                    name={user.name || user.email}
                                    src={user.avatar ? `https://pb-orderit.povoas.top/api/files/users/${user.id}/${user.avatar}` : undefined}
                                    size="lg"
                                    className="w-full h-full text-2xl"
                                />
                            )}

                            {/* Overlay for upload hint */}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Icon name="photo_camera" className="text-3xl text-white" />
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </div>

                    <h2 className="mt-4 text-xl font-bold text-ink">{user.name || 'Sem nome'}</h2>
                    <p className="text-sm text-ink-faint">{user.email}</p>
                </div>

                {/* Settings Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-ink-faint uppercase tracking-wider ml-1">Definições</h3>

                    {/* Name Input */}
                    <div className="card p-4 bg-surface border border-hairline">
                        <label className="block text-xs font-bold text-ink-faint uppercase mb-2">Nome de Exibição</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input flex-1 bg-surface-sunken focus:bg-surface"
                                placeholder="O teu nome..."
                            />
                            <button
                                onClick={handleSaveName}
                                disabled={isSaving || name === user.name}
                                className={cn(
                                    "px-4 rounded-xl font-semibold transition",
                                    isSaving
                                        ? "bg-primary-600 text-white btn-loading"
                                        : name === user.name
                                            ? "bg-surface-sunken text-ink-faint cursor-not-allowed"
                                            : "bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/30",
                                )}
                            >
                                Guardar
                            </button>
                        </div>
                    </div>

                    {/* Chave Gemini — só para quem já tem uma definida (usada no scan de faturas). */}
                    {hasGeminiKey && (
                        <div className="card p-4 bg-surface border border-hairline">
                            <label className="block text-xs font-bold text-ink-faint uppercase mb-1">Chave API Gemini</label>
                            <p className="text-xs text-ink-faint mb-2">
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
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    value={geminiKeyInput}
                                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                                    className="input flex-1 font-mono text-sm bg-surface-sunken focus:bg-surface"
                                    placeholder="A tua chave…"
                                />
                                <button
                                    onClick={handleSaveGeminiKey}
                                    disabled={
                                        isSavingKey ||
                                        !geminiKeyInput.trim() ||
                                        geminiKeyInput.trim() === currentGeminiKey
                                    }
                                    className={cn(
                                        "px-4 rounded-xl font-semibold transition",
                                        isSavingKey
                                            ? "bg-primary-600 text-white btn-loading"
                                            : !geminiKeyInput.trim() ||
                                                geminiKeyInput.trim() === currentGeminiKey
                                                ? "bg-surface-sunken text-ink-faint cursor-not-allowed"
                                                : "bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/30",
                                    )}
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Theme Toggle */}
                    <div className="card p-4 flex items-center justify-between bg-surface border border-hairline cursor-pointer hover:border-hairline-strong transition-colors" onClick={toggleTheme}>
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                theme === 'dark'
                                    ? "bg-surface-sunken text-primary-300"
                                    : "bg-warning-bg text-warning-fg"
                            )}>
                                <Icon name={theme === 'dark' ? 'dark_mode' : 'light_mode'} className="text-2xl" />
                            </div>
                            <div>
                                <p className="font-semibold text-ink">Tema Escuro</p>
                                <p className="text-xs text-ink-faint">Alternar entre claro e escuro</p>
                            </div>
                        </div>
                        <div className={cn(
                            "w-12 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out relative",
                            theme === 'dark' ? "bg-primary-600" : "bg-hairline-strong"
                        )}>
                            <div className={cn(
                                "w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out",
                                theme === 'dark' ? "translate-x-6" : "translate-x-0"
                            )} />
                        </div>
                    </div>
                </div>

                {/* Logout Button */}
                <button
                    onClick={handleLogout}
                    className="w-full py-4 rounded-xl text-danger-fg font-bold bg-danger-bg/50 hover:bg-danger-bg transition-colors border border-danger-fg/20 flex items-center justify-center gap-2"
                >
                    <Icon name="logout" className="text-xl" />
                    Terminar Sessão
                </button>

                <div className="text-center">
                    <p className="text-xs text-ink-faint">Versão 1.0.0 • Order It All!</p>
                </div>
            </div>
        </div>
    );
}
