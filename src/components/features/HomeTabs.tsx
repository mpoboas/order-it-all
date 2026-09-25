'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { Icon, type IconName } from '@/components/ui/Icon';

interface TabItem {
    href: string;
    label: string;
    icon: IconName;
}

const ITEMS: TabItem[] = [
    { href: '/groups', label: 'Grupos', icon: 'groups' },
    { href: '/people', label: 'Amigos', icon: 'person' },
];

/** Segmented control "Grupos · Amigos" no topo do Início — pílula
 *  totalmente arredondada (`rounded-full`), à parte do `GroupTabs` (esse
 *  fica com o seu próprio raio — é usado noutro ecrã, o do grupo). Alterna
 *  entre as duas rotas que hoje formam o Início: `/groups` e `/people`. */
export function HomeTabs() {
    const pathname = usePathname();
    const nav = useAppNavigate();

    usePrefetchRoutes(['/groups', '/people']);

    return (
        <div className="mb-6">
            <div className="flex p-1 bg-surface-sunken rounded-full max-w-6xl mx-auto">
                {ITEMS.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                        <button
                            key={item.href}
                            type="button"
                            onClick={() => nav.push(item.href, { haptic: false, transition: 'none' })}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-full transition-colors',
                                active
                                    ? 'bg-surface text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-ink-soft hover:text-ink',
                            )}
                        >
                            <Icon name={item.icon} className="text-base" />
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
