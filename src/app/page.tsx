'use client';

import { useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { AuthBackdrop, AuthLogo } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';

const PILLARS: { icon: IconName; title: string; text: string }[] = [
    {
        icon: 'shopping_cart',
        title: 'Compras em conjunto',
        text: 'Abre uma viagem, cada um pede o que quer e quem vai às compras vê tudo numa lista.',
    },
    {
        icon: 'receipt_long',
        title: 'Contas certas',
        text: 'Despesas, saldos e quem deve a quem — sempre atualizados.',
    },
    {
        icon: 'send',
        title: 'Acertar num toque',
        text: 'Paga pelo Revolut ou MB WAY, direto da app.',
    },
];

/**
 * Boas-vindas — só para quem NÃO tem sessão (a WPA arranca em `/groups`,
 * ver `manifest.ts`; e todos os ecrãs protegidos mandam para aqui). Com
 * sessão, segue para `/groups` sem pintar nada — o `UserProvider` só monta os
 * filhos depois de ler a sessão, por isso `isLoggedIn` já é o final no 1º
 * render (não há flash das boas-vindas).
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
            <main className="flex-1 flex flex-col justify-center px-4 py-8 on-brand">
                <div className="w-full max-w-sm mx-auto animate-fade-in-up">
                    <div className="text-center">
                        <AuthLogo size={80} className="mx-auto mb-6" />
                        <h1 className="text-4xl font-bold tracking-tight text-ink">Order It All!</h1>
                        <p className="mt-2 text-lg text-ink-soft text-pretty">
                            Organiza as compras do grupo e acerta as contas, sem discussões.
                        </p>
                    </div>

                    <ul className="mt-10 glass-card p-5 space-y-5">
                        {PILLARS.map((p) => (
                            <li key={p.title} className="flex items-start gap-4">
                                <div className="w-11 h-11 shrink-0 rounded-full bg-white/20 border border-white/25 text-ink flex items-center justify-center">
                                    <Icon name={p.icon} className="text-xl" />
                                </div>
                                <div className="min-w-0 pt-0.5">
                                    <p className="font-semibold text-ink">{p.title}</p>
                                    <p className="text-sm text-ink-soft">{p.text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </main>

            <div className="w-full max-w-sm mx-auto px-4 pb-4 space-y-3 on-brand">
                <Button variant="inverse" size="lg" block onClick={() => nav.push('/auth/register')}>
                    Criar conta
                </Button>
                <Button size="lg" variant="ghost" block onClick={() => nav.push('/auth/login')}>
                    Já tenho conta
                </Button>
            </div>
        </AuthBackdrop>
    );
}
