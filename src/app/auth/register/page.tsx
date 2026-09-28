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
import { authErrorMessage, fieldErrorCode } from '@/lib/authErrors';
import { safeRedirect, withRedirect } from '@/lib/authRedirect';

const MIN_PASSWORD = 8;

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailTaken, setEmailTaken] = useState(false);
    const [passwordError, setPasswordError] = useState<string | undefined>();

    const { register, login } = useUser();
    const nav = useAppNavigate();
    const redirect = safeRedirect(useSearchParams().get('redirect'));
    const alreadyIn = useRedirectIfLoggedIn(redirect);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setEmailTaken(false);

        if (password.length < MIN_PASSWORD) {
            setPasswordError(`A password deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
            return;
        }
        setPasswordError(undefined);

        setLoading(true);
        try {
            // Sem "confirmar password": o botão de mostrar a password faz esse
            // papel sem obrigar a escrevê-la duas vezes no telemóvel.
            await register(email.trim(), password, password);
            await login(email.trim(), password);
            nav.replace(withRedirect('/auth/profile-setup', redirect));
        } catch (err) {
            console.error(err);
            setEmailTaken(fieldErrorCode(err, 'email') === 'validation_not_unique');
            setError(authErrorMessage(err, 'register'));
            setLoading(false);
        }
    };

    if (alreadyIn) return <div className="min-h-dvh bg-app" />;

    const toLogin = () => nav.replace(withRedirect('/auth/login', redirect));

    return (
        <AuthShell
            back
            title="Criar conta"
            subtitle="Organiza as compras do grupo e acerta as contas, sem discussões."
            footer={
                <>
                    Já tens conta? <AuthLink onClick={toLogin}>Entrar</AuthLink>
                </>
            }
        >
            <GoogleSignInButton redirect={redirect} />
            <div className="my-5">
                <AuthDivider />
            </div>

            {error && (
                <AuthError>
                    {error}
                    {emailTaken && (
                        <>
                            {' '}
                            <button type="button" onClick={toLogin} className="font-bold underline">
                                Entrar
                            </button>
                        </>
                    )}
                </AuthError>
            )}

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
                <PasswordInput
                    label="Password"
                    id="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError && e.target.value.length >= MIN_PASSWORD) setPasswordError(undefined);
                    }}
                    hint={`Mínimo ${MIN_PASSWORD} caracteres.`}
                    error={passwordError}
                />

                <Button type="submit" size="lg" block loading={loading} className="mt-2">
                    Criar conta
                </Button>
            </form>
        </AuthShell>
    );
}
