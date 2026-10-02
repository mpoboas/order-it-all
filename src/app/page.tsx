'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useUser } from '@/context/UserContext';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { formatEUR } from '@/lib/money';
import { cn } from '@/lib/utils';
import { AuthBackdrop, AuthLink, AuthLogo } from '@/components/auth/AuthShell';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { PaymentLogo } from '@/components/ui/PaymentLogo';

/**
 * Uma "notificação" da cena de boas-vindas: um momento da app a acontecer,
 * em vez de uma lista de funcionalidades. Cartão branco (como as do telemóvel),
 * ligeiramente inclinado (`--tilt`), a entrar com atraso (`delay`).
 */
function Moment({
    visual,
    title,
    detail,
    time,
    tilt,
    delay,
    className,
}: {
    visual: ReactNode;
    title: ReactNode;
    detail: string;
    time: string;
    tilt: string;
    delay: number;
    className?: string;
}) {
    return (
        <div
            className={cn('landing-moment flex items-center gap-3 rounded-2xl bg-white/95 px-3.5 py-3 short:py-2.5 shadow-xl shadow-primary-950/25', className)}
            style={{ '--tilt': tilt, animationDelay: `${delay}ms` } as CSSProperties}
        >
            {visual}
            <div className="min-w-0 flex-1 text-left">
                <p className="line-clamp-2 text-sm min-[360px]:text-[15px] font-semibold leading-tight text-primary-950">{title}</p>
                <p className="truncate text-xs min-[360px]:text-[13px] leading-snug text-primary-900/70">{detail}</p>
            </div>
            <span className="hidden min-[360px]:inline shrink-0 self-start text-[11px] font-medium text-primary-900/60">{time}</span>
        </div>
    );
}

/**
 * Boas-vindas — só para quem NÃO tem sessão (a WPA arranca em `/groups`,
 * ver `manifest.ts`; e todos os ecrãs protegidos mandam para aqui). Com
 * sessão, segue para `/groups` sem pintar nada — o `UserProvider` só monta os
 * filhos depois de ler a sessão, por isso `isLoggedIn` já é o final no 1º
 * render (não há flash das boas-vindas).
 *
 * Mostra em vez de explicar: três momentos da app (pedir, pagar, receber)
 * contam o produto sem texto de marketing. Um só botão principal.
 */
export default function WelcomePage() {
    const { isLoggedIn } = useUser();
    const nav = useAppNavigate();

    useEffect(() => {
        if (isLoggedIn) nav.replace('/groups', { haptic: false, transition: 'none' });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `nav` muda a cada rota
    }, [isLoggedIn]);

    if (isLoggedIn) return <div className="min-h-dvh bg-app" />;

    return (
        <AuthBackdrop>
            {/* Luz atrás do logótipo — devolve a alegria do azul claro sem pôr texto
                branco em cima de um fundo claro. */}
            <div aria-hidden className="brand-glow left-1/2 top-16 -translate-x-1/2 w-72 h-72 bg-primary-300/50 short:top-4 short:w-56 short:h-56" />

            <main className="relative flex-1 flex flex-col justify-center px-4 py-8 short:py-3">
                <div className="w-full max-w-sm mx-auto">
                    <div className="text-center on-brand animate-fade-in-up">
                        <AuthLogo className="mx-auto mb-6 short:mb-4 tiny:mb-3" sizeClassName="w-[104px] h-[104px] short:w-16 short:h-16 tiny:w-12 tiny:h-12" />
                        <h1 className="text-4xl short:text-3xl font-bold tracking-tight text-ink">Order It All!</h1>
                        <p className="mt-2 short:mt-1 text-lg short:text-base text-ink-soft text-pretty">
                            A app de compras que acaba com as discussões.
                        </p>
                    </div>

                    <div className="mt-9 short:mt-5 tiny:mt-4 space-y-2.5 short:space-y-2 px-1">
                        <Moment
                            className="min-[360px]:mr-5 tiny:hidden"
                            tilt="-2deg"
                            delay={250}
                            visual={
                                // O cesto das viagens abertas (`TripList`), um tom mais escuro para
                                // se destacar no cartão branco (lá o fundo é `bg-info-bg`).
                                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary-200 text-primary-800">
                                    <Icon name="local_grocery_store" className="text-lg" />
                                </span>
                            }
                            title="Ricardo pediu 2 Monsters"
                            detail="Primeiras compras"
                            time="agora"
                        />
                        <Moment
                            className="min-[360px]:ml-5"
                            tilt="1.5deg"
                            delay={550}
                            visual={<CategoryIcon category="food" />}
                            title={`Pagaste o jantar · ${formatEUR(46.8)}`}
                            detail="Dividido por 3 pessoas"
                            time="20:41"
                        />
                        <Moment
                            className="min-[360px]:mr-3"
                            tilt="-1deg"
                            delay={850}
                            visual={<PaymentLogo app="mbway" size="lg" variant="symbol" />}
                            title={`O Hélder pagou-te ${formatEUR(15.6)}`}
                            detail="Contas em dia com o Hélder"
                            time="21:02"
                        />
                    </div>
                </div>
            </main>

            <div className="relative w-full max-w-sm mx-auto px-4 pb-5 short:pb-3 text-center on-brand">
                <Button variant="inverse" size="lg" block className="short:h-12" onClick={() => nav.push('/auth/register')}>
                    Vamos lá
                </Button>
                <p className="mt-4 short:mt-3 text-sm text-ink-soft">
                    Já tens conta? <AuthLink onClick={() => nav.push('/auth/login')}>Entrar</AuthLink>
                </p>
            </div>
        </AuthBackdrop>
    );
}
