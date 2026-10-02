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
    /** Ainda mais apertado: para ecrãs com vários campos que têm de caber
     *  sem scroll no telemóvel mais pequeno (ex.: MB WAY/Revolut). */
    compact?: boolean;
    /** Emoji no azulejo saltitante, em vez do logótipo (ex.: 💸 nos pagamentos). */
    emoji?: string;
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
export function AuthShell({ title, subtitle, back, backHref = '/', icon, footer, compact, emoji, children }: AuthShellProps) {
    const nav = useAppNavigate();

    const goBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) nav.back();
        else nav.replace(backHref);
    };

    // Em ecrãs baixos (`short:` ≤700px, `tiny:` ≤600px — ver globals.css) tudo
    // aperta para o formulário e o rodapé caberem sem scroll: o "voltar" passa
    // a flutuar, o logótipo encolhe (e em `tiny:` vai para o lado do título).
    const badgeTile = compact
        ? 'shrink-0 mb-3 w-16 h-16 rounded-2xl text-4xl short:w-12 short:h-12 short:text-2xl short:rounded-xl tiny:mx-0 tiny:mb-0 tiny:w-10 tiny:h-10 tiny:text-xl'
        : 'shrink-0 mb-5 w-[88px] h-[88px] rounded-3xl text-5xl short:mb-3 short:w-14 short:h-14 short:rounded-2xl short:text-3xl tiny:mx-0 tiny:mb-0 tiny:w-10 tiny:h-10 tiny:rounded-xl tiny:text-xl';

    return (
        <AuthBackdrop>
            <div
                className={cn(
                    'px-2 flex items-center on-brand',
                    back ? 'h-11 short:absolute short:inset-x-0 short:top-0 short:z-20' : compact ? 'h-4 short:h-2 tiny:h-0' : 'h-11 short:h-4 tiny:h-0',
                )}
            >
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

            <main className={cn('flex-1 flex flex-col justify-center px-4', compact ? 'pb-4 short:pb-2 tiny:pb-0' : 'pb-8 short:pb-4 tiny:pb-2')}>
                <div className="w-full max-w-sm mx-auto animate-fade-in-up">
                    <div className={cn('text-center on-brand', compact ? 'mb-4 short:mb-3 tiny:mb-2' : 'mb-6 short:mb-4 tiny:mb-3')}>
                        <div className="flex flex-col items-center tiny:flex-row tiny:justify-center tiny:gap-3">
                            <div aria-hidden className={cn('mx-auto glass-card flex items-center justify-center', !icon && 'animate-bounce-slow', badgeTile)}>
                                {emoji ? (
                                    <span className="drop-shadow-lg">{emoji}</span>
                                ) : icon ? (
                                    <Icon name={icon} className="text-[0.66em]" />
                                ) : (
                                    // eslint-disable-next-line @next/next/no-img-element -- SVG estático pequeno
                                    <img src="/favicon.svg" alt="" className="w-3/4 h-3/4 drop-shadow-lg" />
                                )}
                            </div>
                            <h1 className={cn('font-bold tracking-tight text-ink', compact ? 'text-2xl short:text-xl' : 'text-3xl short:text-2xl tiny:text-xl')}>{title}</h1>
                        </div>
                        {subtitle && <p className={cn('mt-2 text-ink-soft text-pretty', compact ? 'text-sm short:mt-1' : 'text-base short:mt-1 short:text-sm')}>{subtitle}</p>}
                    </div>

                    {children && <div className={cn('auth-card', compact ? 'p-5 short:p-4 tiny:p-3' : 'p-6 short:p-5 tiny:p-4')}>{children}</div>}

                    {footer && <div className={cn('text-center text-sm text-ink-soft on-brand', compact ? 'mt-4 short:mt-3 tiny:mt-2' : 'mt-6 short:mt-4 tiny:mt-3')}>{footer}</div>}
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

/** O ícone da app num azulejo de vidro, como no ecrã de boas-vindas antigo.
 *  Tamanho por classes (`sizeClassName`, ex.: `w-24 h-24 short:w-16 short:h-16`)
 *  para poder encolher em ecrãs baixos; por omissão 88px. */
export function AuthLogo({ className, sizeClassName = 'w-[88px] h-[88px]' }: { className?: string; sizeClassName?: string }) {
    return (
        <div className={cn('glass-card flex items-center justify-center animate-bounce-slow', sizeClassName, className)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático pequeno */}
            <img src="/favicon.svg" alt="Order It All" className="w-3/4 h-3/4 drop-shadow-lg" />
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
