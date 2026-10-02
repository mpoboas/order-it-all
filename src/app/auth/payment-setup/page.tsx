'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { normalizeRevtag } from '@/lib/paymentLinks';
import { safeRedirect, withRedirect } from '@/lib/authRedirect';
import { cn } from '@/lib/utils';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { PaymentLogo, type PaymentApp } from '@/components/ui/PaymentLogo';
import { fieldError } from '@/components/ui/Input';

/** Número MB WAY: 9 dígitos a começar por 9, com ou sem +351 / espaços. */
function normalizePhone(value: string): string {
    return value.replace(/[\s-]/g, '').replace(/^(\+351|00351)/, '');
}
const isValidPhone = (v: string) => /^9\d{8}$/.test(v);
const isValidRevtag = (v: string) => /^[a-zA-Z0-9._-]{2,40}$/.test(v);

function OptionalField({
    id,
    label,
    app,
    prefix,
    error,
    helper,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    label: string;
    app: PaymentApp;
    prefix?: string;
    error?: string | null;
    helper: string;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
                <label htmlFor={id} className="flex items-center gap-2.5 text-sm font-bold text-ink">
                    <PaymentLogo app={app} />
                    {label}
                </label>
                <span className="rounded-full bg-surface-sunken border border-hairline px-2 py-0.5 text-xs font-medium text-ink-soft">
                    Opcional
                </span>
            </div>
            <div
                className={cn(
                    'auth-field flex items-center gap-1 px-4 rounded-xl border-2 border-hairline bg-surface-sunken transition-colors',
                    'focus-within:border-primary-500 focus-within:bg-surface',
                    error && cn(fieldError, 'is-error'),
                )}
            >
                {prefix && <span className="text-ink-faint shrink-0">{prefix}</span>}
                <input
                    id={id}
                    aria-invalid={Boolean(error)}
                    aria-describedby={`${id}-help`}
                    className="w-full min-w-0 py-2.5 short:py-2 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
                    {...props}
                />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            {/* Em ecrãs baixos (iPhone SE, browser com barras) a letra desce
                um ponto para o ecrã inteiro caber sem scroll. */}
            <p id={`${id}-help`} className="text-sm leading-snug text-ink-soft short:text-xs">
                {helper}
            </p>
        </div>
    );
}

/**
 * Passo do registo depois do perfil: MB WAY e Revolut, os dois opcionais. É o
 * que faz o "acertar contas" funcionar sem mensagens a pedir o número — quem
 * te deve vê logo como te pagar. Tudo editável mais tarde no Perfil.
 */
export default function PaymentSetupPage() {
    const { user, updateProfile } = useUser();
    const nav = useAppNavigate();
    const { showToast } = useToast();
    const redirect = safeRedirect(useSearchParams().get('redirect'));

    // `null` = ainda não mexeu: mostra o que já está no perfil (o utilizador
    // pode chegar depois do 1.º render, e um estado inicial não se atualiza).
    const [phoneDraft, setPhone] = useState<string | null>(null);
    const [revtagDraft, setRevtag] = useState<string | null>(null);
    const phone = phoneDraft ?? user?.mbway_phone ?? '';
    const revtag = revtagDraft ?? user?.revtag ?? '';
    const [errors, setErrors] = useState<{ phone?: string; revtag?: string }>({});
    const [loading, setLoading] = useState(false);

    const next = () => nav.replace(withRedirect('/onboarding', redirect));
    const hasAny = phone.trim() !== '' || revtag.trim() !== '';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const p = normalizePhone(phone);
        const r = normalizeRevtag(revtag);
        const nextErrors = {
            phone: p && !isValidPhone(p) ? 'Escreve um número de telemóvel com 9 dígitos.' : undefined,
            revtag: r && !isValidRevtag(r) ? 'Só letras, números, "_", "-" ou ".", sem espaços.' : undefined,
        };
        setErrors(nextErrors);
        if (nextErrors.phone || nextErrors.revtag) return;

        setLoading(true);
        try {
            await updateProfile({ mbway_phone: p, revtag: r.toLowerCase() });
            next();
        } catch (error) {
            console.error(error);
            showToast('Não foi possível guardar. Tenta outra vez.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Como te pagam?"
            subtitle="Quando alguém te dever, ao preencheres as seguintes opções, podem pagar-te diretamente pela app."
            compact
            emoji="💸"
            footer={
                <button type="button" onClick={next} className="auth-link font-semibold">
                    Fazer isto mais tarde
                </button>
            }
        >
            <form className="space-y-4 short:space-y-3 tiny:space-y-2" onSubmit={handleSubmit} noValidate>
                <OptionalField
                    id="revtag"
                    label="Revolut"
                    app="revolut"
                    prefix="@"
                    placeholder="a-tua-revtag"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={revtag}
                    error={errors.revtag}
                    onChange={(e) => setRevtag(e.target.value)}
                    helper="Para encontrares a tua revtag basta abrires a aplicação do Revolut e clicar na tua foto de perfil. Encontra-se logo abaixo do teu nome."
                />

                <OptionalField
                    id="mbway"
                    label="MB WAY"
                    app="mbway"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="912 345 678"
                    value={phone}
                    error={errors.phone}
                    onChange={(e) => setPhone(e.target.value)}
                    helper="O teu número de telemóvel, para que te possam pagar diretamente."
                />

                <Button type="submit" size="lg" block className="short:h-11" loading={loading} disabled={!hasAny}>
                    Guardar e continuar
                </Button>
            </form>
        </AuthShell>
    );
}
