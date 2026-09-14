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
    { href: '/groups', label: 'Grupos', icon: 'groups' },
    { href: '/people', label: 'Amigos', icon: 'person' },
    { href: '/activity', label: 'Atividade', icon: 'activity' },
    { href: '/profile', label: 'Perfil', icon: 'person' },
];

/** Barra inferior global — Grupos · Amigos · Atividade · Perfil, à
 *  Splitwise. O separador "Perfil" usa o avatar do utilizador em vez de um
 *  ícone genérico. */
export function GlobalBottomNav() {
    const pathname = usePathname();
    const nav = useAppNavigate();
    const { user } = useUser();

    const isActive = (href: string) => pathname.startsWith(href);

    return (
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-surface/80 backdrop-blur-md border-t border-hairline z-50 md:hidden safe-bottom-nav">
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
                            <div className={cn('transition-transform duration-200', active && 'scale-110')}>
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
                            <span className={cn('text-xs mt-1 font-medium', active && 'font-semibold')}>
                                {item.label}
                            </span>
                            {active && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary-600" />}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
