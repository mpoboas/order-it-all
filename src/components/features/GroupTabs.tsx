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

/** Segmented control por baixo do cabeçalho do grupo — Despesas · Viagens
 *  (a de admin aponta para o dashboard `/admin`, a de membro para `/trips`,
 *  mas o rótulo/ícone são sempre os mesmos "Viagens" — deixou de haver uma
 *  tab "Admin" separada). Saldos já não é tab — passou a chip do
 *  `GroupOverviewBar`, a faixa idêntica nas duas tabs (saldo + ações) entre
 *  o nome do grupo e este segmented control; é também onde vive agora o
 *  separador (antes no fundo deste componente).
 *  Substitui a antiga 2ª barra de baixo (`BottomNav`): agora só há uma
 *  barra de baixo, a global (`GlobalBottomNav`), sempre visível em toda a
 *  app. Responde a "que secção do grupo estou a ver", não a "onde estou na
 *  app" — por isso é um *segmented control* no topo, não uma *tab bar* no
 *  fundo (ver Apple HIG). Aparece nos 4 ecrãs "raiz" do grupo (Admin,
 *  Viagens, Despesas, Saldos), não em sub-ecrãs (detalhe de despesa/viagem,
 *  itens). Funciona em todas as larguras — no desktop substitui os links
 *  que estavam no `Header`. */
export function GroupTabs({ groupId, isAdmin }: GroupTabsProps) {
    const pathname = usePathname();
    const nav = useAppNavigate();
    const basePath = `/groups/${groupId}`;

    const items: TabItem[] = [
        { href: `${basePath}/expenses`, label: 'Despesas', icon: 'receipt_long' },
        { href: isAdmin ? `${basePath}/admin` : `${basePath}/trips`, label: 'Viagens', icon: 'shopping_bag' },
    ];

    usePrefetchRoutes([`${basePath}/expenses`, `${basePath}/admin`, `${basePath}/trips`]);

    return (
        <div className="bg-app px-4 pt-3 pb-2">
            <div className="flex p-1 bg-surface-sunken rounded-xl max-w-6xl mx-auto">
                {items.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                        <button
                            key={item.href}
                            type="button"
                            onClick={() => nav.push(item.href, { haptic: false, transition: 'none' })}
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
