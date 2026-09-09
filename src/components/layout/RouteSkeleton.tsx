import {
  EntityCardSkeletonGrid,
  PageHeaderSkeleton,
} from '@/components/ui/EntityCardSkeleton';

/**
 * Skeleton mostrado por um `loading.tsx` — durante a navegação, ANTES de o
 * segmento de rota (JS/RSC) carregar. Cobre o intervalo em que a página ainda
 * nem montou (em 3G são segundos). Server component: sem dados, pinta já.
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
