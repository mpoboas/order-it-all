'use client';

import { useGroup } from '@/context/GroupContext';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { getGroupAvatarUrl } from '@/lib/groupAvatars';
import { cn } from '@/lib/utils';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { Icon } from '@/components/ui/Icon';
import { StatusBarTint } from '@/components/ui/StatusBarTint';

interface HeaderProps {
    title?: string;
    subtitle?: string;
    showBack?: boolean;
    transparent?: boolean;
    icon?: React.ReactNode;
    /** Ações à direita (ex.: editar/apagar no detalhe de uma despesa). */
    actions?: React.ReactNode;
}

/** Barra fina e neutra — sem gradiente de marca (troca feita depois de nos
 *  aproximarmos do layout do Splitwise: a barra de baixo global é que agora
 *  "diz onde estás na app"; esta é só título + voltar). Trocar de grupo
 *  deixou de ter atalho aqui — usa-se o separador "Grupos" da barra global.
 *  O avatar de perfil também saiu daqui — redundante com o separador
 *  "Perfil" da mesma barra. */
export function Header({ title, subtitle, showBack, transparent = false, icon, actions }: HeaderProps) {
    const { currentGroup } = useGroup();
    const nav = useAppNavigate();

    // Ecrãs de topo (Grupos/Amigos/Atividade) não passam título nenhum — à
    // Splitwise, a identidade do ecrã vive no próprio conteúdo (saudação,
    // cabeçalho de secção), não numa barra fixa. Nesse caso a barra fica
    // "em branco": sem ícone à esquerda, só as `actions` à direita, se as
    // houver.
    const bare = !showBack && !title;
    const displayTitle = title || currentGroup?.name;

    return (
        <header
            className={cn(
                'sticky top-0 z-40 transition duration-300 safe-top border-b border-hairline',
                transparent ? 'bg-transparent border-transparent' : 'bg-surface'
            )}
        >
            {!transparent && <StatusBarTint background="var(--surface)" />}
            <div className="px-4 py-3 md:py-4">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    {/* Left side */}
                    {bare ? (
                        <div />
                    ) : (
                        <div className="flex items-center min-w-0">
                            {showBack ? (
                                <button
                                    type="button"
                                    aria-label="Voltar"
                                    onClick={() => nav.up()}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center mr-3 hover:bg-surface-sunken transition-colors active:scale-95 text-ink"
                                >
                                    <Icon name="chevron_left" className="text-xl" />
                                </button>
                            ) : (
                                <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center mr-3 overflow-hidden">
                                    {icon ? (
                                        typeof icon === 'string' ? (
                                            <span className="text-xl">{icon}</span>
                                        ) : (
                                            icon
                                        )
                                    ) : currentGroup && getGroupAvatarUrl(currentGroup.id, currentGroup.avatar) ? (
                                        <RemoteImage
                                            src={getGroupAvatarUrl(currentGroup.id, currentGroup.avatar)!}
                                            alt="Grupo"
                                            width={36}
                                            height={36}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <span className="text-xl">{currentGroup?.avatar || '🛒'}</span>
                                    )}
                                </div>
                            )}
                            <div className="min-w-0">
                                <h1 className="text-lg md:text-xl font-semibold text-ink truncate">{displayTitle}</h1>
                                {subtitle && (
                                    <p className="text-xs md:text-sm text-ink-soft truncate">{subtitle}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Right side */}
                    {actions && (
                        <div className="flex items-center gap-2">
                            {actions}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
