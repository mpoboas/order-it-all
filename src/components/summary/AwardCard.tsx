import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Paletas dos prémios — fundos com degradê suave e cor própria, para cada
 *  prémio ter a sua "personalidade" (e dar vontade de mostrar). Claro e escuro. */
export type AwardTone = 'gold' | 'sky' | 'rose' | 'emerald' | 'violet';

const TONES: Record<AwardTone, { card: string; badge: string; label: string }> = {
    gold: {
        card: 'from-amber-100 via-yellow-50 to-amber-200/70 border-amber-200/80 dark:from-amber-950 dark:via-yellow-950/40 dark:to-amber-900/40 dark:border-amber-800/50',
        badge: 'bg-white/70 dark:bg-amber-900/60 shadow-amber-500/20',
        label: 'text-amber-800 dark:text-amber-300',
    },
    sky: {
        card: 'from-sky-100 via-blue-50 to-primary-100 border-sky-200/80 dark:from-sky-950 dark:via-primary-950/60 dark:to-primary-900/40 dark:border-sky-800/50',
        badge: 'bg-white/70 dark:bg-sky-900/60 shadow-sky-500/20',
        label: 'text-sky-800 dark:text-sky-300',
    },
    rose: {
        card: 'from-rose-100 via-pink-50 to-rose-200/70 border-rose-200/80 dark:from-rose-950 dark:via-pink-950/40 dark:to-rose-900/40 dark:border-rose-800/50',
        badge: 'bg-white/70 dark:bg-rose-900/60 shadow-rose-500/20',
        label: 'text-rose-800 dark:text-rose-300',
    },
    emerald: {
        card: 'from-emerald-100 via-lime-50 to-emerald-200/70 border-emerald-200/80 dark:from-emerald-950 dark:via-lime-950/30 dark:to-emerald-900/40 dark:border-emerald-800/50',
        badge: 'bg-white/70 dark:bg-emerald-900/60 shadow-emerald-500/20',
        label: 'text-emerald-800 dark:text-emerald-300',
    },
    violet: {
        card: 'from-violet-100 via-fuchsia-50 to-violet-200/70 border-violet-200/80 dark:from-violet-950 dark:via-fuchsia-950/30 dark:to-violet-900/40 dark:border-violet-800/50',
        badge: 'bg-white/70 dark:bg-violet-900/60 shadow-violet-500/20',
        label: 'text-violet-800 dark:text-violet-300',
    },
};

/**
 * Um "prémio" do Resumo: emoji grande num medalhão, o nome do prémio, o
 * vencedor (pessoa, produto, categoria…) em destaque e o número que o
 * justifica. `visual` substitui o emoji (ex.: o avatar da pessoa).
 */
export function AwardCard({
    tone,
    emoji,
    title,
    winner,
    detail,
    visual,
    className,
}: {
    tone: AwardTone;
    emoji: string;
    title: string;
    winner: ReactNode;
    detail: ReactNode;
    visual?: ReactNode;
    className?: string;
}) {
    const t = TONES[tone];
    return (
        <div className={cn('relative overflow-hidden rounded-3xl border bg-gradient-to-br p-5', t.card, className)}>
            {/* Emoji gigante e esbatido ao canto — textura, não informação. */}
            <span aria-hidden className="pointer-events-none absolute -right-3 -top-4 text-8xl opacity-15 rotate-12 select-none">
                {emoji}
            </span>
            <div className="relative flex items-center gap-4">
                <div className={cn('w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-3xl shadow-lg', t.badge)}>
                    {visual ?? emoji}
                </div>
                <div className="min-w-0">
                    <p className={cn('text-xs font-bold uppercase tracking-wider', t.label)}>{title}</p>
                    <p className="mt-0.5 text-lg font-bold leading-tight text-ink break-words">{winner}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{detail}</p>
                </div>
            </div>
        </div>
    );
}
