import type { Expense, Order, Placeholder, Split, Trip } from '@/lib/types';
import { netByParty } from '@/lib/ledger/balances';

/**
 * Proteções da gestão de membros (Definições do grupo) — partilhadas pelo ecrã (que
 * explica porque não dá) e pela rota do servidor (que o impõe:
 * `/api/groups/[groupId]/members/[userId]`). Uma pessoa só sai do grupo (ou é
 * removida) com as contas fechadas: saldo exatamente zero e nada pendente.
 * Sem isto, tirar alguém do grupo deixava dívidas "órfãs" nos saldos dos
 * outros, sem ninguém a quem as cobrar.
 */

export type RemovalBlock =
    | { reason: 'balance'; cents: number }
    | { reason: 'orders'; count: number }
    | { reason: 'expenses'; count: number }
    | { reason: 'splits'; count: number };

/** Mapa placeholder → utilizador que o reclamou (o saldo de um placeholder
 *  reclamado conta como do utilizador — mesma regra de `canonicalPartyId`). */
function resolverFor(placeholders: Pick<Placeholder, 'id' | 'claimed_by'>[]) {
    const claimed = new Map(placeholders.filter((p) => p.claimed_by).map((p) => [p.id, p.claimed_by as string]));
    return (id: string) => claimed.get(id) ?? id;
}

/** Porque é que este utilizador não pode sair / ser removido (ou `null`). */
export function userRemovalBlock({
    userId,
    expenses,
    placeholders,
    trips,
    orders,
}: {
    userId: string;
    expenses: Expense[];
    placeholders: Pick<Placeholder, 'id' | 'claimed_by'>[];
    trips: Pick<Trip, 'id' | 'status'>[];
    orders: Pick<Order, 'trip_id' | 'user'>[];
}): RemovalBlock | null {
    const net = netByParty(
        expenses.filter((e) => !e.deleted_at),
        resolverFor(placeholders),
    );
    const cents = net[userId] ?? 0;
    if (cents !== 0) return { reason: 'balance', cents };

    const openTrips = new Set(trips.filter((t) => t.status !== 'closed').map((t) => t.id));
    const pendingOrders = orders.filter((o) => o.user === userId && openTrips.has(o.trip_id)).length;
    if (pendingOrders > 0) return { reason: 'orders', count: pendingOrders };
    return null;
}

/** Porque é que esta pessoa sem conta não pode ser removida (ou `null`). Tem
 *  de não aparecer em despesa nenhuma nem em divisões ainda abertas — senão o
 *  histórico ficava a apontar para ninguém. */
export function placeholderRemovalBlock({
    placeholderId,
    expenses,
    splits,
}: {
    placeholderId: string;
    expenses: Expense[];
    splits: Pick<Split, 'participants' | 'status'>[];
}): RemovalBlock | null {
    const inExpenses = expenses.filter(
        (e) => !e.deleted_at && (e.payers.some((p) => p.party === placeholderId) || e.shares.some((s) => s.party === placeholderId)),
    ).length;
    if (inExpenses > 0) return { reason: 'expenses', count: inExpenses };
    const inSplits = splits.filter((s) => s.status !== 'closed' && s.participants.includes(placeholderId)).length;
    if (inSplits > 0) return { reason: 'splits', count: inSplits };
    return null;
}

/** Frase para o utilizador — `self` quando é a própria pessoa a sair. */
export function removalBlockMessage(block: RemovalBlock, name: string, self: boolean, formatCents: (c: number) => string): string {
    switch (block.reason) {
        case 'balance':
            if (self) {
                return block.cents > 0
                    ? `Ainda te devem ${formatCents(block.cents)} neste grupo. Acerta as contas antes de sair.`
                    : `Ainda deves ${formatCents(-block.cents)} neste grupo. Acerta as contas antes de sair.`;
            }
            return block.cents > 0
                ? `${name} ainda tem ${formatCents(block.cents)} a receber. Só dá para remover com o saldo a zero.`
                : `${name} ainda deve ${formatCents(-block.cents)}. Só dá para remover com o saldo a zero.`;
        case 'orders':
            return self
                ? `Tens ${block.count === 1 ? 'um pedido' : `${block.count} pedidos`} numa viagem ainda em curso. Espera que a viagem feche.`
                : `${name} tem ${block.count === 1 ? 'um pedido' : `${block.count} pedidos`} numa viagem ainda em curso.`;
        case 'expenses':
            return `${name} aparece em ${block.count === 1 ? 'uma despesa' : `${block.count} despesas`}. Associa-o a uma conta real em vez de o remover.`;
        case 'splits':
            return `${name} faz parte de ${block.count === 1 ? 'uma divisão' : `${block.count} divisões`} ainda aberta${block.count === 1 ? '' : 's'}.`;
    }
}
