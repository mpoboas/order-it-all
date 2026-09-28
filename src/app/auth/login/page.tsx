'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { AuthDivider, GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { AuthError, AuthLink, AuthShell } from '@/components/auth/AuthShell';
import { useRedirectIfLoggedIn } from '@/components/auth/useRedirectIfLoggedIn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { pb } from '@/lib/pocketbase';
import { buildPostAuthPath } from '@/lib/googleAuth';
import { authErrorMessage } from '@/lib/authErrors';
import { safeRedirect, withRedirect } from '@/lib/authRedirect';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { login } = useUser();
    const nav = useAppNavigate();
    const redirect = safeRedirect(useSearchParams().get('redirect'));
    const alreadyIn = useRedirectIfLoggedIn(redirect);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(email.trim(), password);
            const record = pb.authStore.record as { name?: string; onboarded?: boolean } | null;
            // `replace`: voltar atrás depois de entrar não deve reabrir o login.
            nav.replace(buildPostAuthPath(!record?.name?.trim(), redirect, record?.onboarded));
        } catch (err) {
            console.error(err);
            setError(authErrorMessage(err, 'login'));
            setLoading(false);
        }
    };

    if (alreadyIn) return <div className="min-h-dvh bg-app" />;

    return (
        <AuthShell
            back
            title="Entrar"
            subtitle="Bem-vindo de volta."
            footer={
                <>
                    Ainda não tens conta?{' '}
                    <AuthLink onClick={() => nav.replace(withRedirect('/auth/register', redirect))}>
                        Criar conta
                    </AuthLink>
                </>
            }
        >
            <GoogleSignInButton redirect={redirect} />
            <div className="my-5">
                <AuthDivider />
            </div>

            {error && <AuthError>{error}</AuthError>}

            <form className="space-y-4" onSubmit={handleSubmit}>
                <Input
                    label="Email"
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="o-teu@email.com"
                />
                <div>
                    <PasswordInput
                        label="Password"
                        id="password"
                        name="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <div className="mt-2 text-right text-sm">
                        <AuthLink onClick={() => nav.push('/auth/forgot-password')}>
                            Esqueceste-te da password?
                        </AuthLink>
                    </div>
                </div>

                <Button type="submit" size="lg" block loading={loading} className="mt-2">
                    Entrar
                </Button>
            </form>
        </AuthShell>
    );
}
