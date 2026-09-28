import { cn } from '@/lib/utils';

/**
 * Skeletons com a MESMA geometria das listas reais (cartão com linhas
 * `px-4 py-3`, divisórias) — a troca skeleton→conteúdo não mexe no ecrã e o
 * utilizador vê logo "a forma" do que vai aparecer. Substituem os cartões
 * grandes antigos (`EntityCardSkeletonGrid`) e os spinners soltos.
 *
 * `animate-pulse` de propósito: as View Transitions contam-no como "ainda a
 * carregar" (ver `src/lib/viewTransition.ts`).
 */

type Leading = 'group' | 'person' | 'dated' | 'activity' | 'category';

function Bar({ className }: { className?: string }) {
    return <div className={cn('rounded-full bg-surface-sunken', className)} />;
}

function Row({ leading, trailing }: { leading: Leading; trailing: boolean }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            {leading === 'dated' && (
                <div className="w-8 shrink-0 flex flex-col items-center gap-1">
                    <Bar className="h-2.5 w-6" />
                    <Bar className="h-4 w-5" />
                </div>
            )}
            {leading === 'person' || leading === 'activity' ? (
                <div className={cn('shrink-0 rounded-full bg-surface-sunken', leading === 'person' ? 'w-8 h-8' : 'w-10 h-10')} />
            ) : (
                <div className="w-10 h-10 shrink-0 rounded-xl bg-surface-sunken" />
            )}
            <div className="flex-1 min-w-0 space-y-2">
                <Bar className={cn('h-3.5', leading === 'activity' ? 'w-5/6' : 'w-2/5')} />
                {leading !== 'person' && leading !== 'group' && <Bar className="h-3 w-1/3" />}
            </div>
            {trailing && (
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <Bar className="h-2.5 w-12" />
                    <Bar className="h-4 w-16" />
                </div>
            )}
        </div>
    );
}

export function ListSkeleton({
    rows = 4,
    leading = 'group',
    trailing = true,
    bare = false,
    className,
}: {
    rows?: number;
    leading?: Leading;
    trailing?: boolean;
    /** Sem o cartão à volta (listas que não vivem num cartão, ex. Atividade). */
    bare?: boolean;
    className?: string;
}) {
    return (
        <div
            aria-busy="true"
            aria-label="A carregar"
            className={cn('overflow-hidden pointer-events-none', !bare && 'card', className)}
        >
            {/* O pulsar vai nas barras, não no cartão — um cartão a meio da
                opacidade deixava ver o que está por trás (ex.: a faixa azul). */}
            <div className="divide-y divide-hairline animate-pulse">
                {Array.from({ length: rows }, (_, i) => (
                    <Row key={i} leading={leading} trailing={trailing} />
                ))}
            </div>
        </div>
    );
}

/** Cartão "No total, deve-te / deves" + ações (detalhe de amigo). */
export function BalanceHeroSkeleton() {
    return (
        <div aria-hidden className="space-y-4">
            <div className="card p-5">
                <div className="flex flex-col items-center gap-3 animate-pulse">
                    <Bar className="h-3.5 w-32" />
                    <Bar className="h-9 w-40" />
                </div>
            </div>
            <div className="flex justify-center gap-6 animate-pulse">
                {[0, 1].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5 py-1">
                        <div className="w-12 h-12 rounded-full bg-surface-sunken" />
                        <Bar className="h-3 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}
