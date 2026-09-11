import {
  EntityCardSkeletonGrid,
  PageHeaderSkeleton,
} from '@/components/ui/EntityCardSkeleton';

/**
 * Skeleton de página inteira (faixa de header + grelha de cards).
 *
 * Já não há `loading.tsx` — a navegação a quente mantém o ecrã anterior visível
 * até a rota nova estar pronta (coberto pela barra de progresso). Este skeleton
 * é o estado de loading *interno* das páginas que não têm dados em cache local
 * (nav a frio / deep-link), renderizado pela própria página.
 */
export function RouteSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PageHeaderSkeleton />
      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-8 h-8 w-2/3 max-w-xs animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <EntityCardSkeletonGrid count={cards} />
      </main>
    </div>
  );
}
