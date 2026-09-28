'use client';

import { coverColorFor, coverGradientFor } from '@/lib/coverColor';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBarTint } from '@/components/ui/StatusBarTint';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

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
    /** `profile` (omissão) — capa + avatar grande sobreposto + nome centrado
     *  por baixo (detalhe de amigo). `compact` — tudo dentro da capa: título à
     *  esquerda e stack de avatares pequeno na mesma linha (páginas do grupo,
     *  onde a lista de despesas tem de começar mais acima — Fase 15). */
    variant?: 'profile' | 'compact';
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
    variant = 'profile',
}: HeroHeaderProps) {
    const coverBackground = background.kind === 'gradient' ? { background: coverGradientFor(background.seed) } : undefined;
    // Cor da barra de estado (e do topo da capa, que nasce dela): nos grupos o
    // azul da marca, como no Início; nos amigos a cor da capa da pessoa (ou o
    // azul, se a capa for uma foto).
    const edgeColor =
        variant === 'compact' || background.kind === 'image' ? 'var(--brand-from)' : coverColorFor(background.seed);

    const navButtons = (
        <div className="relative flex items-center justify-between px-4 safe-top-min">
            <button
                type="button"
                aria-label="Voltar"
                onClick={onBack}
                className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center text-white hover:bg-white/30 transition-colors active:scale-95"
            >
                <Icon name="chevron_left" className="text-xl" />
            </button>
            {topRightAction && (
                <button
                    type="button"
                    aria-label={topRightAction.label}
                    onClick={topRightAction.onClick}
                    className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center text-white hover:bg-white/30 transition-colors active:scale-95"
                >
                    <Icon name={topRightAction.icon} className="text-xl" />
                </button>
            )}
        </div>
    );

    if (variant === 'compact') {
        return (
            <div className="h-[calc(7rem+var(--safe-top))] relative overflow-hidden" style={coverBackground}>
                {background.kind === 'image' && (
                    // Foto do grupo ligeiramente desfocada e ampliada: é quase
                    // sempre um avatar pequeno esticado (pixelizava) — assim
                    // vira textura de fundo, e o véu azul dá-lhe a cor da marca.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={background.url} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-[3px]" />
                )}
                {/* Véu de baixo para cima — o título branco tem de ler-se sobre
                    qualquer foto ou gradiente claro. Nas fotos é azul da marca
                    (duotone), nos gradientes por nome só escurece. */}
                <div
                    className={cn(
                        'absolute inset-0 bg-gradient-to-t',
                        background.kind === 'image'
                            ? 'from-primary-950/90 via-primary-800/65 to-primary-600/55'
                            : 'from-black/45 via-black/10 to-transparent',
                    )}
                />
                <HeroTopEdge color={edgeColor} />
                {navButtons}
                <div className="absolute inset-x-4 bottom-3 flex items-end gap-3">
                    {/* Wrap até 2 linhas (nomes compridos inteiros); a capa tem altura
                        fixa e os botões lá em cima — uma 3.ª linha ia bater neles. */}
                    <h1 className="flex-1 min-w-0 text-2xl font-bold leading-tight tracking-tight text-white line-clamp-2 break-words text-balance">{title}</h1>
                    <div className="flex items-center shrink-0 pb-0.5">
                        {avatars.map((a, index) => (
                            <div key={`${a.name}-${index}`} className={cn('flex rounded-full ring-2 ring-white/80', index > 0 && '-ml-2')}>
                                <Avatar name={a.name} src={a.src} size="sm" />
                            </div>
                        ))}
                        {avatarOverflowCount > 0 && (
                            <div className="-ml-2 h-8 min-w-8 px-1.5 rounded-full ring-2 ring-white/80 bg-surface text-ink text-xs font-semibold flex items-center justify-center">
                                +{avatarOverflowCount}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

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
                style={coverBackground}
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
                <HeroTopEdge color={edgeColor} />
                {navButtons}

                <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 flex items-center">
                    {avatars.map((a, index) => (
                        <div
                            key={`${a.name}-${index}`}
                            className={cn('flex rounded-full ring-4 ring-app', index > 0 && '-ml-4')}
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
                <h1 className="text-xl font-bold text-ink break-words text-balance">{title}</h1>
                {subtitle && <p className="text-sm text-ink-faint">{subtitle}</p>}
            </div>
        </div>
    );
}

/**
 * Topo da capa com cor ÚNICA — o iPhone pinta a barra de estado com a cor que
 * deteta no topo da página, e a capa (foto, gradiente diagonal) não tem uma;
 * a barra ficava clara. Três peças:
 *  - uma faixa sólida FIXA no topo (`.brand-top-edge--ios`) — é dela que o
 *    iOS tira a cor. Só no iPhone e só com a página no topo (scroll 0): a
 *    capa desliza com o scroll e a faixa não, por isso ao mínimo scroll ficava
 *    uma banda azul lisa por cima da imagem e dos botões;
 *  - o topo da capa desvanece a partir dessa cor (sem costura com a faixa);
 *  - `StatusBarTint` com a mesma cor (instalações antigas e Android).
 */
function HeroTopEdge({ color }: { color: string }) {
    const [atTop, setAtTop] = useState(true);

    useEffect(() => {
        const update = () => setAtTop(window.scrollY <= 2);
        update();
        window.addEventListener('scroll', update, { passive: true });
        return () => window.removeEventListener('scroll', update);
    }, []);

    return (
        <>
            <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-24 pointer-events-none"
                style={{ background: `linear-gradient(to bottom, ${color} 24px, transparent)` }}
            />
            {/* z-index auto: fica por baixo dos botões voltar/definições (vêm depois
                no DOM). */}
            {atTop && (
                <div aria-hidden className="brand-top-edge brand-top-edge--ios" style={{ backgroundColor: color, zIndex: 'auto' }} />
            )}
            <StatusBarTint background={color} />
        </>
    );
}
