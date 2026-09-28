'use client';

import { usePathname } from 'next/navigation';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

interface GroupTabsProps {
    groupId: string;
    isAdmin: boolean;
}

/** Segmented control por baixo do cabeçalho do grupo — Despesas · Viagens
 *  (a de admin aponta para o dashboard `/admin`, a de membro para `/trips`,
 *  mas o rótulo é sempre o mesmo "Viagens" — deixou de haver uma
 *  tab "Admin" separada). Saldos já não é tab — passou a ação do
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

    const items = [
        { key: `${basePath}/expenses`, label: 'Despesas' },
        { key: isAdmin ? `${basePath}/admin` : `${basePath}/trips`, label: 'Viagens' },
    ];

    usePrefetchRoutes([`${basePath}/expenses`, `${basePath}/admin`, `${basePath}/trips`]);

    // Nenhum ativo fora das duas secções.
    const value = items.find((item) => pathname.startsWith(item.key))?.key ?? null;

    return (
        <div className="bg-app px-4 pt-3 pb-2">
            <SegmentedControl
                ariaLabel="Secção do grupo"
                items={items}
                value={value}
                onChange={(href) => nav.push(href, { haptic: false, transition: 'none' })}
                className="max-w-6xl mx-auto"
            />
        </div>
    );
}
