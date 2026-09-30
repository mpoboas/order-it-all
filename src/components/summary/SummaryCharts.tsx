'use client';

import { useId, useState } from 'react';
import type { GroupSummary } from '@/lib/ledger/summary';
import type { Party } from '@/lib/types';
import { getCategory } from '@/lib/ledger/categories';
import { fromCents } from '@/lib/ledger/money';
import { partyAvatarUrl, partyLabel } from '@/lib/parties';
import { formatEUR } from '@/lib/money';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';

const eur = (cents: number) => formatEUR(fromCents(cents));

/** Barra horizontal no azul da marca (degradê + brilho), sobre um trilho claro. */
function Bar({ value, max, tone = 'brand', className }: { value: number; max: number; tone?: 'brand' | 'soft'; className?: string }) {
    const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
    return (
        <div className={cn('h-2.5 rounded-full bg-primary-50 dark:bg-primary-950/60 overflow-hidden', className)}>
            <div
                className={cn(
                    'h-full rounded-full transition-[width] duration-700 ease-out',
                    tone === 'brand'
                        ? 'bg-gradient-to-r from-primary-400 to-primary-600 shadow-[0_0_12px_-2px] shadow-primary-500/50'
                        : 'bg-primary-200 dark:bg-primary-800',
                )}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

/** "Em quê?" — total por categoria, da maior para a menor. */
export function CategoryBreakdown({ items }: { items: GroupSummary['byCategory'] }) {
    const max = items[0]?.cents ?? 0;
    return (
        <ul className="space-y-4">
            {items.map((c) => {
                const cat = getCategory(c.id);
                return (
                    <li key={c.id} className="flex items-center gap-3">
                        <CategoryIcon category={c.id} />
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate font-medium text-ink">{cat.label}</span>
                                <span className="shrink-0 text-sm text-ink-soft">
                                    <Money value={fromCents(c.cents)} className="font-semibold text-ink" />
                                    <span className="ml-1.5 text-ink-faint">{Math.round(c.share * 100)}%</span>
                                </span>
                            </div>
                            <Bar value={c.cents} max={max} />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * "Quando?" — colunas em SVG (dia a dia numa viagem/mês, mês a mês em grupos
 * longos). Toca numa coluna para ver o valor; por omissão mostra a mais alta.
 */
export function TimelineChart({ timeline }: { timeline: GroupSummary['timeline'] }) {
    const gradientId = useId();
    const points = timeline.points;
    const peakIndex = points.reduce((best, p, i) => (p.cents > points[best].cents ? i : best), 0);
    const [selected, setSelected] = useState<number | null>(null);
    const active = selected ?? peakIndex;

    if (points.length === 0) return null;

    const W = 320;
    const H = 140;
    const gap = points.length > 24 ? 2 : 4;
    const barW = Math.max(3, (W - gap * (points.length - 1)) / points.length);
    const max = Math.max(...points.map((p) => p.cents), 1);
    // Rótulos no eixo: no máximo ~7, espaçados.
    const every = Math.ceil(points.length / 7);

    return (
        <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink-soft">
                    {selected === null && points[active].cents > 0
                        ? timeline.granularity === 'day'
                            ? 'O dia mais caro'
                            : 'O mês mais caro'
                        : points[active].fullLabel}
                </span>
                <span className="text-sm">
                    {selected === null && points[active].cents > 0 && (
                        <span className="text-ink-soft mr-1.5">{points[active].fullLabel} ·</span>
                    )}
                    <Money value={fromCents(points[active].cents)} className="font-bold text-primary-700 dark:text-primary-300" />
                </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto overflow-visible" role="img" aria-label="Gastos ao longo do tempo">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary-400)" />
                        <stop offset="100%" stopColor="var(--primary-600)" />
                    </linearGradient>
                </defs>
                <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" strokeWidth="1" />
                {points.map((p, i) => {
                    const h = p.cents > 0 ? Math.max(3, (p.cents / max) * (H - 8)) : 0;
                    const x = i * (barW + gap);
                    const isActive = i === active;
                    return (
                        <g key={p.key} onClick={() => setSelected(i === selected ? null : i)} className="cursor-pointer">
                            {/* Área de toque da altura toda — colunas baixas também se tocam. */}
                            <rect x={x - gap / 2} y={0} width={barW + gap} height={H} fill="transparent" />
                            {h > 0 && (
                                <rect
                                    x={x}
                                    y={H - h}
                                    width={barW}
                                    height={h}
                                    rx={Math.min(barW / 2, 5)}
                                    fill={`url(#${gradientId})`}
                                    opacity={isActive ? 1 : 0.55}
                                />
                            )}
                            {i % every === 0 && (
                                <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--text-faint)">
                                    {p.label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

/** "Quem?" — por pessoa, o que pagou (azul) e o que consumiu (azul claro). */
export function PeopleBreakdown({
    people,
    parties,
    currentUserId,
}: {
    people: GroupSummary['byPerson'];
    parties: Map<string, Party>;
    currentUserId?: string;
}) {
    const max = Math.max(...people.flatMap((p) => [p.paidCents, p.consumedCents]), 0);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs font-medium text-ink-soft">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-primary-400 to-primary-600" /> Pagou
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary-200 dark:bg-primary-800" /> Consumiu
                </span>
            </div>
            <ul className="space-y-4">
                {people.map((p) => {
                    const name = partyLabel(p.party, parties);
                    return (
                        <li key={p.party} className="flex items-center gap-3">
                            <Avatar name={name} src={partyAvatarUrl(p.party, parties)} size="sm" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="min-w-0 break-words font-medium text-ink">
                                        {name}
                                        {p.party === currentUserId && <span className="text-ink-faint font-normal"> (tu)</span>}
                                    </span>
                                    <span className="shrink-0 text-xs text-ink-soft tabular-nums">
                                        {eur(p.paidCents)} · {eur(p.consumedCents)}
                                    </span>
                                </div>
                                <Bar value={p.paidCents} max={max} />
                                <Bar value={p.consumedCents} max={max} tone="soft" className="h-1.5" />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
