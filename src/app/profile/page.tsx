'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { Header } from '@/components/layout/Header';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

export default function ProfilePage() {
    const { user, updateProfile, logout } = useUser();
    const { theme, toggleTheme } = useTheme();
    const { showToast } = useToast();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setName(user.name || '');
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
            showToast('Foto de perfil atualizada!', 'success');
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
            showToast('Nome atualizado!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao atualizar nome', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogout = () => {
        logout();
        // Router push is handled in context but being safe
    };

    if (!user) {
        return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
            <LoadingSpinner />
        </div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pb-20 transition-colors">
            <Header title="Meu Perfil" showBack />

            <div className="max-w-md mx-auto px-4 pt-6 space-y-6">

                {/* Profile Card */}
                <div className="card p-6 flex flex-col items-center bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="relative w-24 h-24 rounded-full overflow-hidden ring-4 ring-gray-50 dark:ring-slate-800 transition-all group-hover:ring-primary-100 dark:group-hover:ring-primary-900/30">
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
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
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

                    <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{user.name || 'Sem nome'}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>

                {/* Settings Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">Definições</h3>

                    {/* Name Input */}
                    <div className="card p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Nome de Exibição</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input flex-1 bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:bg-white dark:focus:bg-slate-900"
                                placeholder="O teu nome..."
                            />
                            <button
                                onClick={handleSaveName}
                                disabled={isSaving || name === user.name}
                                className={cn(
                                    "px-4 rounded-xl font-semibold transition-all",
                                    isSaving || name === user.name
                                        ? "bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
                                        : "bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/30"
                                )}
                            >
                                {isSaving ? '...' : 'Guardar'}
                            </button>
                        </div>
                    </div>

                    {/* Theme Toggle */}
                    <div className="card p-4 flex items-center justify-between bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 cursor-pointer hover:border-gray-200 dark:hover:border-slate-700 transition-colors" onClick={toggleTheme}>
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                theme === 'dark' ? "bg-slate-800 text-blue-400" : "bg-orange-100 text-orange-500"
                            )}>
                                {theme === 'dark' ? (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900 dark:text-white">Tema Escuro</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Alternar entre claro e escuro</p>
                            </div>
                        </div>
                        <div className={cn(
                            "w-12 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out relative",
                            theme === 'dark' ? "bg-primary-600" : "bg-gray-200 dark:bg-slate-700"
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
                    className="w-full py-4 rounded-xl text-red-500 font-bold bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors border border-red-100 dark:border-red-900/50 flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Terminar Sessão
                </button>

                <div className="text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-600">Versão 1.0.0 • Order It All!</p>
                </div>
            </div>
        </div>
    );
}
