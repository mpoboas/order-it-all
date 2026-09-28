'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useUser } from '@/context/UserContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { getUserAvatarUrl } from '@/lib/orderParticipants';

interface NavItem {
    href: string;
    label: string;
    icon: IconName;
}

const ITEMS: NavItem[] = [
    { href: '/groups', label: 'Início', icon: 'home' },
    { href: '/activity', label: 'Atividade', icon: 'activity' },
    { href: '/profile', label: 'Perfil', icon: 'person' },
];

/** Barra inferior global — Início · Atividade · Perfil. Grupos e Amigos
 *  fundiram-se na tab "Início" (segmented control interno, ver `HomeTabs`),
 *  por isso o separador "Início" (`/groups`) fica ativo também em `/people`.
 *  O separador "Perfil" usa o avatar do utilizador em vez de um ícone
 *  genérico. */
export function GlobalBottomNav() {
    const pathname = usePathname();
    const nav = useAppNavigate();
    const { user } = useUser();

    const isActive = (href: string) =>
        href === '/groups'
            ? pathname.startsWith('/groups') || pathname.startsWith('/people')
            : pathname.startsWith(href);

    // Fundo opaco: translúcida (80%, e ainda a 95%) o texto das listas lia-se
    // através da barra e colidia com os rótulos (Fase 15). Sem blur, também
    // deixa de haver o custo de re-amostrar o fundo a cada frame de scroll.
    return (
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-surface border-t border-hairline z-50 md:hidden safe-bottom-nav">
            <div className="flex items-center justify-around h-16">
                {ITEMS.map((item) => {
                    const active = isActive(item.href);
                    const isProfile = item.href === '/profile';
                    return (
                        <button
                            key={item.href}
                            onClick={() => nav.push(item.href, { transition: 'none' })}
                            className={cn(
                                'relative flex flex-col items-center justify-center flex-1 h-full transition duration-200',
                                'active:scale-95',
                                active ? 'text-primary-600' : 'text-ink-soft'
                            )}
                        >
                            {/* Pílula azul por trás do separador ativo — a cor da marca
                                a dizer "estás aqui", em vez de só um ponto. */}
                            <div
                                className={cn(
                                    'flex items-center justify-center h-8 w-14 rounded-full transition duration-200',
                                    active && 'bg-primary-50 dark:bg-primary-950',
                                )}
                            >
                                {isProfile && user ? (
                                    <Avatar
                                        name={user.name || user.email}
                                        src={getUserAvatarUrl(user.id, user.avatar)}
                                        size="xs"
                                        className={cn(active && 'ring-2 ring-primary-500')}
                                    />
                                ) : (
                                    <Icon name={item.icon} className="text-2xl" strokeWidth={active ? 2.25 : 1.75} />
                                )}
                            </div>
                            <span className={cn('text-xs mt-0.5 font-medium', active && 'font-semibold')}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
