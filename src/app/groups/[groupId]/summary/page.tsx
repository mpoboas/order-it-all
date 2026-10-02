'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useExpenses, useGroupOrderItems, useParties } from '@/lib/db/hooks';
import { canonicalPartyId, partyAvatarUrl, partyLabel } from '@/lib/parties';
import { computeGroupSummary, expenseMonths, type SummaryPeriod } from '@/lib/ledger/summary';
import { getCategory } from '@/lib/ledger/categories';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { Header } from '@/components/layout/Header';
import { BrandBand } from '@/components/layout/BrandBand';
import { Money } from '@/components/ui/Money';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ListSkeleton } from '@/components/ui/ListSkeleton';
import { AwardCard } from '@/components/summary/AwardCard';
import { PeriodPicker } from '@/components/summary/PeriodPicker';
import { CategoryBreakdown, PeopleBreakdown, TimelineChart } from '@/components/summary/SummaryCharts';



const eur = (cents: number) => formatEUR(fromCents(cents));

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    return (
        <section>
            <div className="px-1 mb-3">
                <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
                {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
            </div>
            {children}
        </section>
    );
}

/**
 * Resumo do grupo (ex-"Totais") — página própria em vez de uma folha: o
 * essencial numa faixa da marca, os gráficos (em quê / quando / quem) e os
 * "Prémios do grupo", que cruzam as contas com os pedidos das viagens. Os
 * números vêm todos de `computeGroupSummary` (`src/lib/ledger/summary.ts`).
 */
export default function GroupSummaryPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const expenses = useExpenses(groupId);
    const parties = useParties(groupId);
    const orderItems = useGroupOrderItems(groupId);
    const [period, setPeriod] = useState<SummaryPeriod>('all');
    /** Mês mostrado no seletor enquanto "Sempre" está ativo (por omissão, o último). */
    const [lastMonth, setLastMonth] = useState<SummaryPeriod | null>(null);
    const months = useMemo(() => (expenses ? expenseMonths(expenses) : []), [expenses]);
    const shownMonth = period !== 'all' ? period : (lastMonth ?? months[months.length - 1] ?? null);
    const changePeriod = (next: SummaryPeriod) => {
        setPeriod(next);
        if (next !== 'all') setLastMonth(next);
    };

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const userId: string | undefined = user?.id;
    const summary = useMemo(() => {
        if (!expenses || !parties || !userId) return null;
        return computeGroupSummary({
            expenses,
            resolve: (id) => canonicalPartyId(id, parties),
            userId,
            period,
            orderItems: orderItems ?? [],
        });
    }, [expenses, parties, userId, period, orderItems]);

    if (!isLoggedIn) return null;

    const name = (id: string) => (id === user?.id ? 'Tu' : parties ? partyLabel(id, parties) : '');
    const avatar = (id: string) => (
        <Avatar name={parties ? partyLabel(id, parties) : '?'} src={parties ? partyAvatarUrl(id, parties) : undefined} size="md" />
    );

    const change =
        summary && summary.previousTotalCents !== null && summary.previousTotalCents > 0
            ? Math.round(((summary.totalCents - summary.previousTotalCents) / summary.previousTotalCents) * 100)
            : null;

    const diff = summary ? summary.youPaidCents - summary.yourShareCents : 0;
    const a = summary?.awards;

    return (
        <div className="min-h-dvh bg-app">
            <Header title="Resumo" showBack />

            <BrandBand>
                <div className="flex flex-col items-center text-center pt-2 pb-2">
                    <p className="text-sm font-medium text-ink-soft">Gasto do grupo</p>
                    {summary ? (
                        <Money value={fromCents(summary.totalCents)} as="p" className="mt-1 text-5xl font-black tracking-tight text-ink" />
                    ) : (
                        <div className="mt-2 h-12 w-48 rounded-full bg-white/20 animate-pulse" />
                    )}
                    {summary && summary.expenseCount > 0 && (
                        <p className="mt-2 text-sm text-ink-soft">
                            {summary.expenseCount} {summary.expenseCount === 1 ? 'despesa' : 'despesas'} · {eur(summary.perPersonCents)} por pessoa
                            {summary.perDayCents !== null && ` · ${eur(summary.perDayCents)} por dia`}
                        </p>
                    )}
                    {change !== null && change !== 0 && (
                        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-sm font-semibold text-ink">
                            <Icon name={change > 0 ? 'call_made' : 'call_received'} className="text-base" />
                            {Math.abs(change)}% {change > 0 ? 'mais' : 'menos'} que no mês anterior
                        </span>
                    )}
                </div>
            </BrandBand>

            <main className="container mx-auto max-w-lg px-4 pt-5 pb-12 space-y-8">
                <PeriodPicker months={months} period={period} month={shownMonth} onChange={changePeriod} />

                {!summary ? (
                    <ListSkeleton rows={4} leading="category" />
                ) : summary.expenseCount === 0 ? (
                    <div className="card p-8 text-center">
                        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-300 flex items-center justify-center">
                            <Icon name="receipt_long" className="text-3xl" />
                        </div>
                        <p className="font-semibold text-ink">Ainda não há despesas {period === 'all' ? 'neste grupo' : 'neste período'}</p>
                        <p className="mt-1 text-sm text-ink-soft">Quando houver despesas, vês aqui em que se gastou, quando e quem pagou, e os prémios do grupo.</p>
                    </div>
                ) : (
                    <>
                        {/* A tua parte vs o que pagaste — escondido se não entraste em
                            nenhuma despesa do período (0 e 0 dava "pagaste exatamente
                            a tua parte", que não diz nada). */}
                        {(summary.youPaidCents !== 0 || summary.yourShareCents !== 0) && (
                            <section className="card p-5">
                                <div className="grid grid-cols-2 divide-x divide-hairline">
                                    <div className="pr-4">
                                        <p className="text-sm text-ink-soft">Pagaste</p>
                                        <Money value={fromCents(summary.youPaidCents)} as="p" className="text-2xl font-bold text-primary-700 dark:text-primary-300" />
                                    </div>
                                    <div className="pl-4">
                                        <p className="text-sm text-ink-soft">A tua parte</p>
                                        <Money value={fromCents(summary.yourShareCents)} as="p" className="text-2xl font-bold text-ink" />
                                    </div>
                                </div>
                                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-primary-50 dark:bg-primary-950/60 px-3.5 py-2.5 text-sm text-primary-800 dark:text-primary-200">
                                    <Icon name={diff >= 0 ? 'balance' : 'info'} className="mt-0.5 text-base shrink-0" />
                                    {diff > 0
                                        ? `Adiantaste ${eur(diff)} a mais do que consumiste.`
                                        : diff < 0
                                          ? `Consumiste ${eur(-diff)} a mais do que pagaste.`
                                          : 'Pagaste exatamente a tua parte.'}
                                </p>
                            </section>
                        )}

                        {/* Prémios */}
                        {a && (a.bank || a.classic || a.biggest || a.topCategory || a.accountant) && (
                            <Section title="Prémios do grupo">
                                <div className="space-y-3">
                                    {a.bank && (
                                        <AwardCard
                                            tone="gold"
                                            emoji="🏦"
                                            title="O Banco do Grupo"
                                            winner={name(a.bank.party)}
                                            detail={`Adiantou ${eur(a.bank.cents)} a mais do que consumiu`}
                                            visual={avatar(a.bank.party)}
                                        />
                                    )}
                                    {a.classic && (
                                        <AwardCard
                                            tone="emerald"
                                            emoji="🛒"
                                            title="O Clássico da Lista"
                                            winner={a.classic.name}
                                            detail={`Pedido ${a.classic.count} vezes nas viagens`}
                                        />
                                    )}
                                    {a.biggest && (
                                        <button
                                            type="button"
                                            className="block w-full text-left active:scale-[0.99] transition"
                                            onClick={() => nav.push(`/groups/${groupId}/expenses/${a.biggest!.expenseId}`, { haptic: false })}
                                        >
                                            <AwardCard
                                                tone="rose"
                                                emoji="💸"
                                                title={period === 'all' ? 'A Despesa do Ano' : 'A Despesa do Mês'}
                                                winner={a.biggest.description}
                                                detail={`${eur(a.biggest.cents)} · pago por ${a.biggest.payers.map((id) => (id === userId ? 'ti' : name(id))).join(', ')}`}
                                            />
                                        </button>
                                    )}
                                    {a.topCategory && (
                                        <AwardCard
                                            tone="violet"
                                            emoji={getCategory(a.topCategory.id).emoji}
                                            title="A Categoria da Casa"
                                            winner={getCategory(a.topCategory.id).label}
                                            detail={`${Math.round(a.topCategory.share * 100)}% de tudo o que o grupo gastou`}
                                        />
                                    )}
                                    {a.accountant && (
                                        <AwardCard
                                            tone="sky"
                                            emoji="🧾"
                                            title="O Contabilista"
                                            winner={name(a.accountant.userId)}
                                            detail={`Registou ${a.accountant.count} ${a.accountant.count === 1 ? 'despesa' : 'despesas'}`}
                                            visual={avatar(a.accountant.userId)}
                                        />
                                    )}
                                </div>
                            </Section>
                        )}

                        <Section title="Em quê?">
                            <div className="card p-5">
                                <CategoryBreakdown items={summary.byCategory} />
                            </div>
                        </Section>

                        {summary.timeline.points.length > 1 && (
                            <Section title="Quando?" subtitle={summary.timeline.granularity === 'day' ? 'Dia a dia' : 'Mês a mês'}>
                                <div className="card p-5">
                                    <TimelineChart timeline={summary.timeline} />
                                </div>
                            </Section>
                        )}

                        {parties && (
                            <Section title="Quem?" subtitle="O que cada um pagou e o que consumiu">
                                <div className="card p-5">
                                    <PeopleBreakdown people={summary.byPerson} parties={parties} currentUserId={user?.id} />
                                </div>
                            </Section>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
