'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { StatusBarTint } from '@/components/ui/StatusBarTint';

interface AuthShellProps {
    title: string;
    subtitle?: ReactNode;
    /** Botão "voltar" no canto: `true` volta no histórico (ou para `backHref`
     *  se não houver para onde voltar — a WPA arranca sem histórico). */
    back?: boolean;
    backHref?: string;
    /** Em vez do logótipo (ex.: ícone de "email enviado"). */
    icon?: IconName;
    /** Rodapé por baixo do cartão (ex.: "Ainda não tens conta? Criar conta"). */
    footer?: ReactNode;
    children?: ReactNode;
}

/**
 * Moldura dos ecrãs de autenticação (entrar, criar conta, recuperar password,
 * perfil, convite) — o mesmo fundo, tipografia e cartões do resto da app, com
 * claro/escuro. Substitui o antigo "vidro fosco" sobre gradiente azul.
 *
 * Coluna estreita (max-w-sm) centrada na vertical: no telemóvel o teclado
 * sobe e empurra o conteúdo, por isso nada fica preso ao fundo do ecrã.
 */
export function AuthShell({ title, subtitle, back, backHref = '/', icon, footer, children }: AuthShellProps) {
    const nav = useAppNavigate();

    const goBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) nav.back();
        else nav.replace(backHref);
    };

    return (
        <AuthBackdrop>
            <div className="h-11 px-2 flex items-center on-brand">
                {back && (
                    <button
                        type="button"
                        onClick={goBack}
                        className="w-11 h-11 -ml-0.5 flex items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-sunken active:scale-95"
                        aria-label="Voltar"
                    >
                        <Icon name="chevron_left" className="text-2xl" />
                    </button>
                )}
            </div>

            <main className="flex-1 flex flex-col justify-center px-4 pb-8">
                <div className="w-full max-w-sm mx-auto animate-fade-in-up">
                    <div className="text-center mb-6 on-brand">
                        {icon ? (
                            <div className="mx-auto mb-5 w-16 h-16 rounded-2xl glass-card flex items-center justify-center">
                                <Icon name={icon} className="text-3xl" />
                            </div>
                        ) : (
                            <AuthLogo className="mx-auto mb-5" />
                        )}
                        <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
                        {subtitle && <p className="mt-2 text-base text-ink-soft text-pretty">{subtitle}</p>}
                    </div>

                    {children && <div className="auth-card p-6">{children}</div>}

                    {footer && <div className="mt-6 text-center text-sm text-ink-soft on-brand">{footer}</div>}
                </div>
            </main>
        </AuthBackdrop>
    );
}

/**
 * O fundo dos ecrãs de acesso (entrar, criar conta, convite, boas-vindas): o
 * gradiente azul da marca com manchas de luz desfocadas. O texto sobre o gradiente usa `.on-brand` (branco); o formulário vai num
 * `.auth-card` sólido com os tokens normais (campos brancos, texto escuro).
 * É a primeira coisa que alguém vê da app — tem de ter cara de "Order It".
 */
export function AuthBackdrop({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn('brand-page relative min-h-dvh gradient-mesh safe-screen flex flex-col overflow-hidden', className)}>
            <StatusBarTint background="var(--brand-from)" color="var(--brand-from)" />
            {/* Cor sólida no topo — é daqui que o iPhone tira a cor da barra de estado. */}
            <div aria-hidden className="brand-top-edge" />
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="brand-glow top-32 -left-24 w-80 h-80 bg-primary-400/30" />
                <div className="brand-glow -bottom-24 -right-24 w-96 h-96 bg-primary-400/20" />
            </div>
            <div className="relative z-10 flex-1 flex flex-col">{children}</div>
        </div>
    );
}

/** O ícone da app num azulejo de vidro, como no ecrã de boas-vindas antigo. */
export function AuthLogo({ className, size = 64 }: { className?: string; size?: number }) {
    return (
        <div
            className={cn('glass-card flex items-center justify-center animate-bounce-slow', className)}
            style={{ width: size + 24, height: size + 24 }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático pequeno */}
            <img src="/favicon.svg" alt="Order It All" width={size} height={size} className="drop-shadow-lg" style={{ width: size * 0.75, height: size * 0.75 }} />
        </div>
    );
}

/** Link de texto dos ecrãs de auth ("Criar conta", "Esqueceste-te da password?"). */
export function AuthLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="auth-link font-semibold hover:underline focus:outline-none focus-visible:underline"
        >
            {children}
        </button>
    );
}

/** Aviso de erro por cima do formulário (em vez de um toast que desaparece). */
export function AuthError({ children }: { children: ReactNode }) {
    return (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            <Icon name="warning" className="mt-0.5 shrink-0 text-base" />
            <div className="min-w-0">{children}</div>
        </div>
    );
}
