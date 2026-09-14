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

interface GroupTabsProps {
    groupId: string;
    isAdmin: boolean;
}

/** Segmented control por baixo do cabeçalho do grupo — Admin/Viagens ·
 *  Despesas · Saldos. Substitui a antiga 2ª barra de baixo (`BottomNav`):
 *  agora só há uma barra de baixo, a global (`GlobalBottomNav`), sempre
 *  visível em toda a app. Responde a "que secção do grupo estou a ver", não
 *  a "onde estou na app" — por isso é um *segmented control* no topo, não
 *  uma *tab bar* no fundo (ver Apple HIG). Aparece nos 4 ecrãs "raiz" do
 *  grupo (Admin, Viagens, Despesas, Saldos), não em sub-ecrãs (detalhe de
 *  despesa/viagem, itens). Funciona em todas as larguras — no desktop
 *  substitui os links que estavam no `Header`. */
export function GroupTabs({ groupId, isAdmin }: GroupTabsProps) {
    const pathname = usePathname();
    const nav = useAppNavigate();
    const basePath = `/groups/${groupId}`;

    const items: TabItem[] = isAdmin
        ? [
            { href: `${basePath}/admin`, label: 'Admin', icon: 'admin_panel_settings' },
            { href: `${basePath}/expenses`, label: 'Despesas', icon: 'receipt_long' },
            { href: `${basePath}/balances`, label: 'Saldos', icon: 'balance' },
        ]
        : [
            { href: `${basePath}/trips`, label: 'Viagens', icon: 'shopping_bag' },
            { href: `${basePath}/expenses`, label: 'Despesas', icon: 'receipt_long' },
            { href: `${basePath}/balances`, label: 'Saldos', icon: 'balance' },
        ];

    usePrefetchRoutes([`${basePath}/admin`, `${basePath}/expenses`, `${basePath}/trips`, `${basePath}/balances`]);

    return (
        <div className="bg-app px-4 pt-3 pb-2 border-b border-hairline">
            <div className="flex p-1 bg-surface-sunken rounded-xl max-w-6xl mx-auto">
                {items.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                        <button
                            key={item.href}
                            type="button"
                            onClick={() => nav.push(item.href, { haptic: false })}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-colors',
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
