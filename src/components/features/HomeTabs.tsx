'use client';

import { usePathname } from 'next/navigation';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

const ITEMS = [
    { key: '/groups', label: 'Grupos' },
    { key: '/people', label: 'Amigos' },
];

/** Segmented control "Grupos · Amigos" no topo do Início. Alterna entre as
 *  duas rotas que hoje formam o Início: `/groups` e `/people`. */
export function HomeTabs() {
    const pathname = usePathname();
    const nav = useAppNavigate();

    usePrefetchRoutes(['/groups', '/people']);

    const value = ITEMS.find((item) => pathname.startsWith(item.key))?.key ?? '/groups';

    return (
        <SegmentedControl
            ariaLabel="Início"
            items={ITEMS}
            value={value}
            onChange={(href) => nav.push(href, { haptic: false, transition: 'none' })}
            className="mb-6 max-w-6xl mx-auto"
        />
    );
}
