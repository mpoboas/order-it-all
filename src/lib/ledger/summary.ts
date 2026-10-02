import type { Expense } from '@/lib/types';
import { toCents } from './money';
import { MONTHS_PT } from '@/lib/utils';

/**
 * "Resumo" do grupo (Fase 1) — tudo o que a página `/groups/[g]/summary`
 * mostra, calculado aqui, puro e testável; a página só desenha. Três camadas:
 *  1. o essencial (total, média por pessoa/dia, a tua parte vs o que pagaste,
 *     comparação com o período anterior);
 *  2. os gráficos (por categoria, ao longo do tempo, por pessoa);
 *  3. os prémios — cruzam as contas com o que o grupo PEDE nas viagens (o que
 *     nenhum Splitwise sabe).
 * Pagamentos (acertos) e despesas apagadas nunca contam — são movimentos de
 * dinheiro, não gasto.
 */

/** `'all'` ou um mês concreto, `'YYYY-MM'` (o seletor só mostra meses com despesas). */
export type SummaryPeriod = 'all' | `${number}-${string}`;

/** Despesas a sério: nem pagamentos (acertos) nem apagadas. */
function activeExpenses(expenses: Expense[]): Expense[] {
    return expenses.filter((e) => !e.deleted_at && e.kind !== 'payment');
}

function filterByPeriod(expenses: Expense[], period: SummaryPeriod): Expense[] {
    const active = activeExpenses(expenses);
    return period === 'all' ? active : active.filter((e) => monthKey(new Date(e.date)) === period);
}

/** Meses (`YYYY-MM`) com pelo menos uma despesa, do mais antigo para o mais recente. */
export function expenseMonths(expenses: Expense[]): SummaryPeriod[] {
    return [...new Set(activeExpenses(expenses).map((e) => monthKey(new Date(e.date))))].sort() as SummaryPeriod[];
}

/** "setembro 2026" a partir de `2026-09`. */
export function monthLabel(key: string): string {
    const [y, m] = key.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** O mês antes de `2026-09` → `2026-08`. */
function previousMonth(key: string): string {
    const [y, m] = key.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface SummaryOrderItem {
    name: string;
    quantity?: number;
    /** Data do pedido — para o período. */
    created: string;
}

export interface TimelinePoint {
    key: string;
    /** Rótulo curto no eixo ("14", "set"). */
    label: string;
    /** Rótulo completo ("14 set.", "setembro 2026"). */
    fullLabel: string;
    cents: number;
}

export interface GroupSummary {
    totalCents: number;
    expenseCount: number;
    /** Pessoas com parte nas despesas do período. */
    peopleCount: number;
    perPersonCents: number;
    /** Dias entre a 1.ª e a última despesa (só quando a linha do tempo é diária). */
    days: number | null;
    perDayCents: number | null;
    youPaidCents: number;
    yourShareCents: number;
    /** Total do mês anterior (só com um mês escolhido). */
    previousTotalCents: number | null;
    byCategory: { id: string; cents: number; share: number }[];
    timeline: { granularity: 'day' | 'month'; points: TimelinePoint[] };
    byPerson: { party: string; paidCents: number; consumedCents: number }[];
    awards: {
        /** Quem mais adiantou (pagou − consumiu). */
        bank?: { party: string; cents: number };
        /** Quem registou mais despesas. */
        accountant?: { userId: string; count: number };
        biggest?: { expenseId: string; description: string; cents: number; payers: string[]; date: string };
        /** O produto mais pedido nas viagens. */
        classic?: { name: string; count: number };
        topCategory?: { id: string; share: number; cents: number };
    };
}

const DAY_MS = 86_400_000;
/** Até quantos dias a linha do tempo é diária (viagem/evento); acima, mensal. */
const DAILY_MAX_DAYS = 62;

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}
function monthKey(d: Date): string {
    return d.toISOString().slice(0, 7);
}
function startOfUtcDay(d: Date): number {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function buildTimeline(expenses: Expense[], period: SummaryPeriod, now: Date): GroupSummary['timeline'] {
    const byDay = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const e of expenses) {
        const d = new Date(e.date);
        byDay.set(dayKey(d), (byDay.get(dayKey(d)) ?? 0) + toCents(e.amount));
        byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) ?? 0) + toCents(e.amount));
    }

    // Intervalo: o mês inteiro num período mensal (o corrente só até hoje);
    // senão, da 1.ª à última despesa.
    let from: number;
    let to: number;
    if (period !== 'all') {
        const [y, m] = period.split('-').map(Number);
        from = Date.UTC(y, m - 1, 1);
        const monthEnd = Date.UTC(y, m, 0);
        to = period === monthKey(now) ? Math.min(monthEnd, startOfUtcDay(now)) : monthEnd;
    } else if (expenses.length > 0) {
        const times = expenses.map((e) => startOfUtcDay(new Date(e.date)));
        from = Math.min(...times);
        to = Math.max(...times);
    } else {
        return { granularity: 'day', points: [] };
    }

    const spanDays = Math.round((to - from) / DAY_MS) + 1;
    if (spanDays <= DAILY_MAX_DAYS) {
        const points: TimelinePoint[] = [];
        for (let t = from; t <= to; t += DAY_MS) {
            const d = new Date(t);
            const key = dayKey(d);
            points.push({
                key,
                label: String(d.getUTCDate()),
                fullLabel: `${d.getUTCDate()} ${MONTHS_PT[d.getUTCMonth()]}.`,
                cents: byDay.get(key) ?? 0,
            });
        }
        return { granularity: 'day', points };
    }

    const points: TimelinePoint[] = [];
    const start = new Date(from);
    const end = new Date(to);
    for (
        let y = start.getUTCFullYear(), m = start.getUTCMonth();
        y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth());
        m === 11 ? ((m = 0), y++) : m++
    ) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        points.push({ key, label: MONTHS_PT[m], fullLabel: `${MONTH_NAMES[m]} ${y}`, cents: byMonth.get(key) ?? 0 });
    }
    return { granularity: 'month', points };
}

/** Total do mês anterior ao escolhido (para "X% mais que em agosto"). */
function previousPeriodTotal(all: Expense[], period: SummaryPeriod): number | null {
    if (period === 'all') return null;
    const prev = previousMonth(period) as SummaryPeriod;
    return filterByPeriod(all, prev).reduce((sum, e) => sum + toCents(e.amount), 0);
}

function inPeriod(created: string, period: SummaryPeriod): boolean {
    return period === 'all' || monthKey(new Date(created)) === period;
}

/** Nome "bonito" de um produto — a grafia mais usada entre os pedidos. */
function classicItem(items: SummaryOrderItem[]): GroupSummary['awards']['classic'] {
    const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
    for (const it of items) {
        const clean = it.name.trim().replace(/\s+/g, ' ');
        if (!clean) continue;
        const norm = clean.toLocaleLowerCase('pt');
        const g = groups.get(norm) ?? { count: 0, spellings: new Map() };
        g.count += 1;
        g.spellings.set(clean, (g.spellings.get(clean) ?? 0) + 1);
        groups.set(norm, g);
    }
    let best: GroupSummary['awards']['classic'];
    for (const g of groups.values()) {
        // Um produto pedido uma só vez não é "clássico" nenhum.
        if (g.count < 2 || (best && g.count <= best.count)) continue;
        const name = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
        best = { name, count: g.count };
    }
    return best;
}

export function computeGroupSummary({
    expenses: allExpenses,
    resolve,
    userId,
    period,
    orderItems = [],
    now = new Date(),
}: {
    expenses: Expense[];
    /** Id canónico de uma parte (funde placeholders reclamados). */
    resolve: (partyId: string) => string;
    userId: string;
    period: SummaryPeriod;
    orderItems?: SummaryOrderItem[];
    now?: Date;
}): GroupSummary {
    const expenses = filterByPeriod(allExpenses, period);

    let totalCents = 0;
    let youPaidCents = 0;
    let yourShareCents = 0;
    const paid = new Map<string, number>();
    const consumed = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const createdBy = new Map<string, number>();
    let biggest: Expense | undefined;

    for (const e of expenses) {
        const cents = toCents(e.amount);
        totalCents += cents;
        const cat = e.category || 'other';
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + cents);
        if (e.created_by) createdBy.set(e.created_by, (createdBy.get(e.created_by) ?? 0) + 1);
        if (!biggest || cents > toCents(biggest.amount)) biggest = e;
        for (const p of e.payers) {
            const id = resolve(p.party);
            const c = toCents(p.amount);
            paid.set(id, (paid.get(id) ?? 0) + c);
            if (id === userId) youPaidCents += c;
        }
        for (const s of e.shares) {
            const id = resolve(s.party);
            const c = toCents(s.amount);
            consumed.set(id, (consumed.get(id) ?? 0) + c);
            if (id === userId) yourShareCents += c;
        }
    }

    const people = new Set([...consumed.keys()]);
    const peopleCount = people.size;
    const timeline = buildTimeline(expenses, period, now);
    const days = timeline.granularity === 'day' && timeline.points.length > 0 ? timeline.points.length : null;

    const categories = [...byCategory.entries()]
        .map(([id, cents]) => ({ id, cents, share: totalCents ? cents / totalCents : 0 }))
        .sort((a, b) => b.cents - a.cents);

    const byPerson = [...new Set([...paid.keys(), ...consumed.keys()])]
        .map((party) => ({ party, paidCents: paid.get(party) ?? 0, consumedCents: consumed.get(party) ?? 0 }))
        .sort((a, b) => b.paidCents + b.consumedCents - (a.paidCents + a.consumedCents));

    // --- Prémios ---------------------------------------------------------------
    const bankEntry = byPerson
        .map((p) => ({ party: p.party, cents: p.paidCents - p.consumedCents }))
        .sort((a, b) => b.cents - a.cents)[0];
    const accountantEntry = [...createdBy.entries()].sort((a, b) => b[1] - a[1])[0];
    const topCategory = categories[0];

    return {
        totalCents,
        expenseCount: expenses.length,
        peopleCount,
        perPersonCents: peopleCount ? Math.round(totalCents / peopleCount) : 0,
        days,
        perDayCents: days ? Math.round(totalCents / days) : null,
        youPaidCents,
        yourShareCents,
        previousTotalCents: previousPeriodTotal(allExpenses, period),
        byCategory: categories,
        timeline,
        byPerson,
        awards: {
            bank: bankEntry && bankEntry.cents > 0 ? bankEntry : undefined,
            // Com uma despesa só, "quem registou mais" não diz nada.
            accountant: accountantEntry && expenses.length >= 3 ? { userId: accountantEntry[0], count: accountantEntry[1] } : undefined,
            biggest: biggest
                ? {
                      expenseId: biggest.id,
                      description: biggest.description,
                      cents: toCents(biggest.amount),
                      payers: [...new Set(biggest.payers.map((p) => resolve(p.party)))],
                      date: biggest.date,
                  }
                : undefined,
            classic: classicItem(orderItems.filter((it) => inPeriod(it.created, period))),
            topCategory: topCategory && categories.length > 1 ? topCategory : undefined,
        },
    };
}
