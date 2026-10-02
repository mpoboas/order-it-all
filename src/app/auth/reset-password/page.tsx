'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthError, AuthLink, AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useToast } from '@/context/ToastContext';
import { pb, usersApi } from '@/lib/pocketbase';
import { buildPostAuthPath } from '@/lib/googleAuth';
import { authErrorMessage, emailFromResetToken, fieldErrorCode } from '@/lib/authErrors';

const MIN_PASSWORD = 8;

/**
 * Escolher password nova — destino do link do email de "Recuperar password"
 * (`?token=…`). Depois de a alterar entra logo com ela (o email vem no próprio
 * token), em vez de mandar o utilizador escrever tudo outra vez no login.
 *
 * Abre sempre no browser (o link do email nunca abre a WPA instalada no iOS);
 * a password nova serve depois para entrar também na app instalada.
 */
export default function ResetPasswordPage() {
    const nav = useAppNavigate();
    const { showToast } = useToast();
    const token = useSearchParams().get('token') ?? '';
    const email = useMemo(() => emailFromResetToken(token), [token]);

    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [expired, setExpired] = useState(!token);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < MIN_PASSWORD) {
            setPasswordError(`A password deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
            return;
        }
        setPasswordError(undefined);
        setLoading(true);
        try {
            await usersApi.confirmPasswordReset(token, password, password);
        } catch (err) {
            console.error(err);
            if (fieldErrorCode(err, 'token')) setExpired(true);
            else setError(authErrorMessage(err, 'reset-confirm'));
            setLoading(false);
            return;
        }

        showToast('Password alterada', 'success');
        // Outra conta com sessão neste browser? Sai dela antes de entrar.
        if (pb.authStore.record && pb.authStore.record.email !== email) pb.authStore.clear();
        try {
            if (!email) throw new Error('sem email no token');
            await usersApi.authWithPassword(email, password);
            const record = pb.authStore.record as { name?: string; onboarded?: boolean } | null;
            nav.replace(buildPostAuthPath(!record?.name?.trim(), null, record?.onboarded));
        } catch {
            // A password mudou na mesma — só não deu para entrar sozinho.
            nav.replace('/auth/login');
        }
    };

    if (expired) {
        return (
            <AuthShell
                icon="link_off"
                title="Link expirado"
                subtitle="Este link já não é válido. Os links de recuperação expiram e só funcionam uma vez."
                footer={<AuthLink onClick={() => nav.replace('/auth/login')}>Voltar a entrar</AuthLink>}
            >
                <Button size="lg" block onClick={() => nav.replace('/auth/forgot-password')}>
                    Pedir um link novo
                </Button>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            icon="key"
            title="Nova password"
            subtitle={
                email ? (
                    <>
                        Escolhe uma password nova para
                        <span className="block mt-1 font-semibold text-ink wrap-anywhere">{email}</span>
                    </>
                ) : (
                    'Escolhe uma password nova para a tua conta.'
                )
            }
        >
            {error && <AuthError>{error}</AuthError>}
            <form className="space-y-4" onSubmit={handleSubmit}>
                {/* Para o gestor de passwords associar a password nova à conta certa. */}
                {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
                <PasswordInput
                    label="Nova password"
                    id="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError && e.target.value.length >= MIN_PASSWORD) setPasswordError(undefined);
                    }}
                    hint={`Mínimo ${MIN_PASSWORD} caracteres.`}
                    error={passwordError}
                />
                <Button type="submit" size="lg" block loading={loading} className="mt-2">
                    Guardar e entrar
                </Button>
            </form>
        </AuthShell>
    );
}
