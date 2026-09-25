'use client';

import { Icon, type IconName } from '@/components/ui/Icon';
import { useCollapseOnScroll } from '@/hooks/useCollapseOnScroll';

interface ExpandableFabProps {
    icon: IconName;
    label: string;
    onClick: () => void;
}

/** FAB do Início ("Criar Grupo"/"Adicionar Amigo") — completa (ícone +
 *  rótulo) no topo da página, colapsa para só o ícone ao fazer scroll down e
 *  volta a expandir ao fazer scroll up (não fica preso a uma posição — ver
 *  `useCollapseOnScroll`), para não tapar a lista com tanto peso visual
 *  (padrão "Extended FAB → FAB" do Material 3, ex.: Gmail). O ícone vive
 *  numa caixa de tamanho fixo que nunca muda — animar padding/
 *  justify-content ao mesmo tempo que a largura é o que fazia o ícone
 *  "saltar" na primeira versão. Só a área do rótulo anima, via
 *  `grid-template-columns: 0fr ↔ 1fr` em vez de `width`/`max-width` — a
 *  largura não anima bem a partir de `auto`, e um `max-width` fixo obriga a
 *  adivinhar o suficiente para cada rótulo; o truque do grid mede o
 *  conteúdo sozinho, sem JS. A página que a usa tem de reservar espaço
 *  extra no fundo do `<main>` (`pb-24`) — o `has-bottom-nav` do ecrã só
 *  reserva a altura da barra inferior, não a desta FAB, que flutua por
 *  cima dela. */
export function ExpandableFab({ icon, label, onClick }: ExpandableFabProps) {
    const collapsed = useCollapseOnScroll();

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="fixed right-3 z-30 h-12 rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 flex items-center font-semibold active:scale-95 transition-transform duration-150"
            style={{ bottom: 'calc(var(--bottom-nav-total-height) + 0.75rem)' }}
        >
            <span className="h-12 w-12 flex items-center justify-center shrink-0">
                <Icon name={icon} className="text-lg" />
            </span>
            <span
                className="grid transition-[grid-template-columns] duration-300 ease-out"
                style={{ gridTemplateColumns: collapsed ? '0fr' : '1fr' }}
            >
                <span className="min-w-0 overflow-hidden">
                    <span className="block pr-5 text-sm whitespace-nowrap">{label}</span>
                </span>
            </span>
        </button>
    );
}
