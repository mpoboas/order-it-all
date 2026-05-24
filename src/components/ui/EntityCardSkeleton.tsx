import { cn } from '@/lib/utils';

function EntityCardSkeletonInner({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'card p-5 flex flex-col gap-4 animate-pulse pointer-events-none',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="h-5 w-3/4 rounded-lg bg-[var(--bg-tertiary)]" />
          <div className="h-4 w-1/2 rounded-lg bg-[var(--bg-tertiary)]" />
          <div className="h-4 w-full rounded-lg bg-[var(--bg-tertiary)]" />
        </div>
        <div className="space-y-2 shrink-0">
          <div className="h-3 w-10 rounded bg-[var(--bg-tertiary)] ml-auto" />
          <div className="h-7 w-16 rounded-lg bg-[var(--bg-tertiary)]" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="h-4 w-20 rounded bg-[var(--bg-tertiary)]" />
        <div className="h-4 w-16 rounded bg-[var(--bg-tertiary)]" />
      </div>
      <div className="h-px w-full bg-[var(--bg-tertiary)]" />
      <div className="flex justify-between items-center">
        <div className="h-6 w-24 rounded-full bg-[var(--bg-tertiary)]" />
        <div className="h-6 w-6 rounded bg-[var(--bg-tertiary)]" />
      </div>
    </div>
  );
}

export function EntityCardSkeletonGrid({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4 md:grid-cols-2 lg:grid-cols-3',
        className
      )}
      aria-busy="true"
      aria-label="A carregar"
    >
      {Array.from({ length: count }, (_, i) => (
        <EntityCardSkeletonInner key={i} />
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div
      aria-hidden
      className="h-[72px] md:h-[80px] bg-gradient-to-r from-primary-600 via-primary-700 to-primary-800 animate-pulse"
    />
  );
}
