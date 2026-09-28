'use client';

import { useEffect, useState } from 'react';
import { AuthError, AuthLink, AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { usersApi } from '@/lib/pocketbase';
import { authErrorMessage } from '@/lib/authErrors';

/** Segundos até poder pedir outro email (o PocketBase também limita). */
const RESEND_COOLDOWN = 30;

/**
 * Recuperar password — pede o email de reposição ao PocketBase. O link do
 * email abre `/auth/reset-password?token=…` (template em
 * `pb/migrations/7_password_reset_email.js`).
 *
 * Serve também quem criou a conta com o Google e nunca teve password: a
 * reposição define uma, e passa a poder entrar das duas formas.
 */
export default function ForgotPasswordPage() {
    const nav = useAppNavigate();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const send = async (address: string) => {
        setError(null);
        setLoading(true);
        try {
            await usersApi.requestPasswordReset(address);
            setSentTo(address);
            setCooldown(RESEND_COOLDOWN);
        } catch (err) {
            console.error(err);
            setError(authErrorMessage(err, 'reset-request'));
        } finally {
            setLoading(false);
        }
    };

    const backToLogin = () => nav.replace('/auth/login');

    if (sentTo) {
        return (
            <AuthShell
                back
                backHref="/auth/login"
                icon="mark_email_read"
                title="Verifica o teu email"
                subtitle={
                    <>
                        Se existir uma conta com
                        <span className="block my-1 font-semibold text-ink wrap-anywhere">{sentTo}</span>
                        vais receber um link para escolher uma password nova.
                    </>
                }
                footer={
                    <>
                        Não recebeste? Vê a pasta de spam ou{' '}
                        {cooldown > 0 ? (
                            <span className="text-ink-faint">reenvia daqui a {cooldown}s</span>
                        ) : (
                            <AuthLink onClick={() => send(sentTo)}>reenvia o email</AuthLink>
                        )}
                        .
                    </>
                }
            >
                {error && <AuthError>{error}</AuthError>}
                <Button size="lg" block onClick={backToLogin}>
                    Voltar a entrar
                </Button>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            back
            backHref="/auth/login"
            icon="lock"
            title="Recuperar password"
            subtitle="Diz-nos o email da tua conta e enviamos-te um link para escolheres uma password nova."
            footer={
                <>
                    Lembraste-te? <AuthLink onClick={backToLogin}>Entrar</AuthLink>
                </>
            }
        >
            {error && <AuthError>{error}</AuthError>}
            <form
                className="space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    send(email.trim());
                }}
            >
                <Input
                    label="Email"
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="o-teu@email.com"
                />
                <Button type="submit" size="lg" block loading={loading} className="mt-2">
                    Enviar link
                </Button>
            </form>
        </AuthShell>
    );
}
