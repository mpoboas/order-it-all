'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { AuthDivider, GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [loading, setLoading] = useState(false);

    const { register, login } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect');
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPass) {
            showToast('As passwords não coincidem', 'error');
            return;
        }

        if (password.length < 8) {
            showToast('A password deve ter pelo menos 8 caracteres', 'error');
            return;
        }

        setLoading(true);
        try {
            await register(email, password, confirmPass);
            await login(email, password);
            showToast('Conta criada com sucesso!', 'success');
            router.push(redirect ? `/auth/profile-setup?redirect=${redirect}` : '/auth/profile-setup');
        } catch (error: any) {
            console.error(error);
            showToast(error.message || 'Erro ao criar conta', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" />
            </div>

            <div className="w-full max-w-md bg-white/20 backdrop-blur-xl rounded-3xl p-8 border border-white/30 shadow-2xl relative z-10 animate-fade-in-up">
                <div className="text-center mb-8">
                    <div
                        onClick={() => router.push('/')}
                        className="mx-auto w-20 h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 cursor-pointer hover:scale-105 transition-transform shadow-lg"
                    >
                        <img
                            src="/favicon.ico"
                            alt="Order It All"
                            className="w-12 h-12 drop-shadow-md"
                        />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                        Criar conta
                    </h2>
                    <p className="text-white/80 text-sm">
                        Ou{' '}
                        <button
                            onClick={() => router.push(redirect ? `/auth/login?redirect=${encodeURIComponent(redirect)}` : '/auth/login')}
                            className="font-bold text-white hover:underline focus:outline-none"
                        >
                            entrar na tua conta existente
                        </button>
                    </p>
                </div>

                <div className="space-y-5">
                    <GoogleSignInButton redirect={redirect} />
                    <AuthDivider />
                </div>

                <form className="space-y-5 mt-5" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-white/90 mb-1">
                            Email
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="appearance-none block w-full px-4 py-3 bg-white/80 border border-white/30 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                            placeholder="teu@email.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-1">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="appearance-none block w-full px-4 py-3 bg-white/80 border border-white/30 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                            placeholder="••••••••"
                        />
                    </div>

                    <div>
                        <label htmlFor="confirmPass" className="block text-sm font-medium text-white/90 mb-1">
                            Confirmar Password
                        </label>
                        <input
                            id="confirmPass"
                            name="confirmPass"
                            type="password"
                            required
                            value={confirmPass}
                            onChange={e => setConfirmPass(e.target.value)}
                            className="appearance-none block w-full px-4 py-3 bg-white/80 border border-white/30 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 bg-white text-violet-600 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50 transform active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? 'A criar conta...' : 'Criar conta'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
