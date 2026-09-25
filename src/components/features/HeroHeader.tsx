'use client';

import { coverGradientFor } from '@/lib/coverColor';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBarTint } from '@/components/ui/StatusBarTint';
import { cn } from '@/lib/utils';

interface HeroHeaderAvatar {
    name: string;
    src?: string;
}

interface HeroHeaderProps {
    title: string;
    subtitle?: string;
    background: { kind: 'image'; url: string } | { kind: 'gradient'; seed: string };
    /** 1 avatar (amigo) a 3 (stack de membros do grupo). */
    avatars: HeroHeaderAvatar[];
    /** "+N" quando há mais participantes do que os mostrados no stack. */
    avatarOverflowCount?: number;
    onBack: () => void;
    topRightAction?: { icon: IconName; label: string; onClick: () => void };
}

/** Hero partilhado pelo detalhe de grupo e pelo detalhe de amigo — capa
 *  (foto do grupo, quando existir, ou gradiente estável por nome), stack de
 *  avatares sobreposto e centrado, nome por baixo. Substitui o antigo
 *  `GroupCoverHeader` e o bloco inline da página de amigo: as únicas
 *  diferenças entre os dois casos são nome, avatares e fundo. */
export function HeroHeader({
    title,
    subtitle,
    background,
    avatars,
    avatarOverflowCount = 0,
    onBack,
    topRightAction,
}: HeroHeaderProps) {
    return (
        <div>
            {/* Contentor da capa: altura fixa (`h-28` + a safe-area do topo) —
                é a referência para o stack de avatares sobreposto
                (`-bottom-8`). Cresce com `--safe-top` para o botão voltar/
                definições nunca ficarem debaixo do "chrome" do sistema (notch,
                e — no iOS/iPadOS 27 — a nova faixa de blur que a WPA instalada
                pinta por cima do topo). Sem `overflow-hidden` de propósito: a
                metade de baixo dos avatares tem de "sair" desta caixa para
                sobrepor o conteúdo seguinte, tal como no desenho de referência. */}
            <div
                className="h-[calc(7rem+var(--safe-top))] relative"
                style={background.kind === 'gradient' ? { background: coverGradientFor(background.seed) } : undefined}
            >
                {background.kind === 'image' && (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={background.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30" />
                    </>
                )}
                {/* Mesma cor/gradiente da capa — a faixa disfarçada fica contínua
                    com o que está mesmo por baixo. Para foto de fundo, aproxima
                    com o tom escuro do overlay em vez da imagem (evita esticar
                    a mesma foto a duas escalas diferentes numa faixa de 16px). */}
                <StatusBarTint background={background.kind === 'gradient' ? coverGradientFor(background.seed) : 'rgba(0,0,0,0.55)'} />
                <div className="relative flex items-center justify-between px-4 safe-top-min">
                    <button
                        type="button"
                        aria-label="Voltar"
                        onClick={onBack}
                        className="w-9 h-9 rounded-xl bg-black/20 backdrop-blur flex items-center justify-center text-white hover:bg-black/30 transition-colors active:scale-95"
                    >
                        <Icon name="chevron_left" className="text-xl" />
                    </button>
                    {topRightAction && (
                        <button
                            type="button"
                            aria-label={topRightAction.label}
                            onClick={topRightAction.onClick}
                            className="w-9 h-9 rounded-xl bg-black/20 backdrop-blur flex items-center justify-center text-white hover:bg-black/30 transition-colors active:scale-95"
                        >
                            <Icon name={topRightAction.icon} className="text-xl" />
                        </button>
                    )}
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 flex items-center">
                    {avatars.map((a, index) => (
                        <div
                            key={`${a.name}-${index}`}
                            className={cn('rounded-full ring-4 ring-app', index > 0 && '-ml-4')}
                        >
                            <Avatar name={a.name} src={a.src} size="lg" />
                        </div>
                    ))}
                    {avatarOverflowCount > 0 && (
                        <div className="-ml-4 w-16 h-16 rounded-full ring-4 ring-app bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 flex items-center justify-center text-sm font-bold shrink-0">
                            +{avatarOverflowCount}
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-12 pb-4 px-4 text-center">
                <h1 className="text-xl font-bold text-ink truncate">{title}</h1>
                {subtitle && <p className="text-sm text-ink-faint">{subtitle}</p>}
            </div>
        </div>
    );
}
