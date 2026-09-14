'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { Icon, type IconName } from '@/components/ui/Icon';

interface NavItem {
    href: string;
    label: string;
    icon: IconName;
}

interface BottomNavProps {
    groupId: string;
    isAdmin: boolean;
}

export function BottomNav({ groupId, isAdmin }: BottomNavProps) {
    const pathname = usePathname();
    const nav = useAppNavigate();

    const basePath = `/groups/${groupId}`;

    const navItems: NavItem[] = isAdmin
        ? [
            { href: `${basePath}/admin`, label: 'Admin', icon: 'admin_panel_settings' },
            { href: `${basePath}/expenses`, label: 'Despesas', icon: 'receipt_long' },
        ]
        : [
            { href: `${basePath}/trips`, label: 'Viagens', icon: 'shopping_bag' },
            { href: `${basePath}/expenses`, label: 'Despesas', icon: 'receipt_long' },
        ];

    // As rotas do fundo são fixas por papel — pré-carrega todas para a troca ser instantânea.
    usePrefetchRoutes([`${basePath}/admin`, `${basePath}/expenses`, `${basePath}/trips`]);

    const isActive = (href: string) => {
        return pathname.startsWith(href);
    };

    return (
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-surface/80 backdrop-blur-md border-t border-hairline z-50 md:hidden safe-bottom">
            <div className="flex items-center justify-around h-16">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <button
                            key={item.href}
                            onClick={() => nav.push(item.href)}
                            className={cn(
                                // `relative`: o ponto de ativo e `absolute`. Sem isto ancorava no
                                // <nav> e so saltava para o sitio certo quando o active:scale-95
                                // criava um transform no botao.
                                'relative flex flex-col items-center justify-center flex-1 h-full transition duration-200',
                                'active:scale-95',
                                active ? 'text-primary-600' : 'text-ink-soft'
                            )}
                        >
                            <div className={cn(
                                'transition-transform duration-200',
                                active && 'scale-110'
                            )}>
                                <Icon name={item.icon} className="text-2xl" strokeWidth={active ? 2.25 : 1.75} />
                            </div>
                            <span className={cn(
                                'text-xs mt-1 font-medium',
                                active && 'font-semibold'
                            )}>
                                {item.label}
                            </span>
                            {active && (
                                <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary-600" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
