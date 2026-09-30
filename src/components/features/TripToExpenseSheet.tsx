'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { Avatar } from '@/components/ui/Avatar';
import { formatEUR } from '@/lib/money';
import { ordersApi, itemsApi, splitsApi, expensesApi, placeholdersApi } from '@/lib/pocketbase';
import { findPlaceholderByName, partyLabel, partyAvatarUrl } from '@/lib/parties';
import { calculateExportGrandTotal, calculateSplitTotals } from '@/lib/splitShare';
import { reconcileItemLock } from '@/lib/splitItems';
import {
    getSplitParticipantNames,
    participantIdsToNames,
    isGroupDisplayLabel,
    isAggregatedOrderLabel,
} from '@/lib/orderParticipants';
import { db } from '@/lib/db/schema';
import { mutationErrorMessage } from '@/lib/db/mutations';
import { fromCents } from '@/lib/ledger/money';
import { itemizedLedger } from '@/lib/ledger/shares';
import { useToast } from '@/context/ToastContext';
import { useUser } from '@/context/UserContext';
import type { Trip, Group, Item, Order, Party, SplitItem } from '@/lib/types';

interface PreviewOrder {
    order: Order;
    label: string;
    priced: { name: string; price: number; participantIds: string[] }[];
    unpriced: Item[];
}

interface TripToExpenseSheetProps {
    isOpen: boolean;
    onClose: () => void;
    trip: Trip | null;
    groupId: string;
    group: Group;
    parties: Map<string, Party>;
    onCreated: (expenseId: string) => void;
}

export function TripToExpenseSheet({
    isOpen,
    onClose,
    trip,
    groupId,
    group,
    parties,
    onCreated,
}: TripToExpenseSheetProps) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [orders, setOrders] = useState<PreviewOrder[] | null>(null);
    const [payerId, setPayerId] = useState<string>('');

    useEffect(() => {
        if (!isOpen || !trip) {
            setOrders(null);
            return;
        }
        setPayerId(user?.id ?? '');
        setLoading(true);
        (async () => {
            try {
                const memberMap = new Map<string, string>();
                const groupPeople: { id: string; name: string }[] = [];
                if (group.expand?.creator) groupPeople.push(group.expand.creator);
                if (group.expand?.admins) groupPeople.push(...group.expand.admins);
                if (group.expand?.members) groupPeople.push(...group.expand.members);
                for (const m of groupPeople) {
                    if (!m?.id || memberMap.has(m.id)) continue;
                    memberMap.set(m.id, m.name);
                }

                const allParticipantsSet = new Set<string>(memberMap.values());
                const rawOrders = await ordersApi.getByTrip(trip.id);
                for (const order of rawOrders) {
                    if (order.participants?.length) {
                        participantIdsToNames(order.participants, memberMap, order.expand?.participants)
                            .forEach((name) => allParticipantsSet.add(name));
                    }
                    const orderUserId = order.user || order.expand?.user?.id;
                    if (orderUserId && memberMap.has(orderUserId)) {
                        allParticipantsSet.add(memberMap.get(orderUserId)!);
                    } else if (
                        order.user_name?.trim() &&
                        !isGroupDisplayLabel(order.user_name) &&
                        !isAggregatedOrderLabel(order.user_name)
                    ) {
                        allParticipantsSet.add(order.user_name.trim());
                    }
                }
                const creatorName = memberMap.get(user?.id || '') || user?.name || 'Eu';
                allParticipantsSet.add(creatorName);
                const allParticipantsList = Array.from(allParticipantsSet);

                const preview: PreviewOrder[] = [];
                for (const order of rawOrders) {
                    const items = await itemsApi.getByOrder(order.id);
                    const splitNames = getSplitParticipantNames(order, memberMap, allParticipantsList);
                    const orderUserId = order.user || order.expand?.user?.id;
                    const label = (orderUserId && memberMap.get(orderUserId)) || order.user_name || 'Pedido';
                    const priced: PreviewOrder['priced'] = [];
                    const unpriced: Item[] = [];
                    for (const item of items) {
                        if (item.found_status === 'found' && item.price > 0) {
                            priced.push({ name: item.name, price: item.price, participantIds: splitNames });
                        } else {
                            unpriced.push(item);
                        }
                    }
                    if (priced.length > 0 || unpriced.length > 0) {
                        preview.push({ order, label, priced, unpriced });
                    }
                }
                setOrders(preview);
            } catch (error) {
                console.error('Error loading trip preview:', error);
                showToast('Erro ao carregar a viagem', 'error');
                onClose();
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, trip?.id]);

    const totalCents = useMemo(() => {
        if (!orders) return 0;
        return orders.reduce(
            (sum, o) => sum + o.priced.reduce((s, i) => s + Math.round(i.price * 100), 0),
            0,
        );
    }, [orders]);

    const unpricedCount = useMemo(
        () => (orders ?? []).reduce((sum, o) => sum + o.unpriced.length, 0),
        [orders],
    );

    const parties_ = useMemo(() => Array.from(parties.values()), [parties]);

    const handleConfirm = async () => {
        if (!trip || !orders || totalCents <= 0 || !payerId) return;
        setCreating(true);
        try {
            const memberMap = new Map<string, string>();
            const groupPeople: { id: string; name: string }[] = [];
            if (group.expand?.creator) groupPeople.push(group.expand.creator);
            if (group.expand?.admins) groupPeople.push(...group.expand.admins);
            if (group.expand?.members) groupPeople.push(...group.expand.members);
            for (const m of groupPeople) {
                if (!m?.id || memberMap.has(m.id)) continue;
                memberMap.set(m.id, m.name);
            }
            const nameById = new Map<string, string>();
            for (const [id, name] of memberMap) nameById.set(name.trim().toLowerCase(), id);

            const existingPlaceholders = await placeholdersApi.getByGroups([groupId]);
            const nameToId = new Map<string, string>();
            const resolveNameToId = async (name: string): Promise<string> => {
                const norm = name.trim().toLowerCase();
                const cached = nameToId.get(norm);
                if (cached) return cached;
                const memberId = nameById.get(norm);
                if (memberId) {
                    nameToId.set(norm, memberId);
                    return memberId;
                }
                const existing = findPlaceholderByName(name, existingPlaceholders);
                if (existing) {
                    nameToId.set(norm, existing.id);
                    return existing.id;
                }
                const created = await placeholdersApi.create({
                    group_id: groupId,
                    name: name.trim(),
                    created_by: user!.id,
                });
                existingPlaceholders.push(created);
                await db.placeholders.put(created);
                nameToId.set(norm, created.id);
                return created.id;
            };

            const allParticipantNames = new Set<string>();
            for (const o of orders) {
                for (const item of o.priced) {
                    for (const name of item.participantIds) allParticipantNames.add(name);
                }
            }
            const allParticipantIds = await Promise.all(
                Array.from(allParticipantNames).map(resolveNameToId),
            );

            const splitItems: SplitItem[] = [];
            for (const o of orders) {
                for (const item of o.priced) {
                    const participantIds = await Promise.all(item.participantIds.map(resolveNameToId));
                    splitItems.push(
                        reconcileItemLock(
                            { name: item.name, price: item.price, participants: participantIds },
                            allParticipantIds,
                        ),
                    );
                }
            }

            const split = await splitsApi.create({
                name: trip.name,
                description: `Gerado automaticamente a partir da viagem "${trip.name}"`,
                group_id: groupId,
                created_by: user!.id,
                participants: allParticipantIds,
                items: splitItems,
            });

            // Em cêntimos: as partes por pessoa vêm de somas com dízimas (10 € a
            // 3 = 3,333…) e o servidor exige Σ partes = Σ pagadores = total
            // (`pb/hooks/ledger_invariants.js`) — ver `itemizedLedger`.
            const grandTotal = calculateExportGrandTotal(split.items);
            const ledger = itemizedLedger(calculateSplitTotals(split), grandTotal, [
                { party: payerId, amount: grandTotal },
            ]);
            const amount = fromCents(ledger.amountCents);
            const expense = await expensesApi.create({
                group_id: groupId,
                description: trip.name,
                amount,
                date: new Date().toISOString().slice(0, 10),
                split_mode: 'itemized',
                payers: [{ party: payerId, amount }],
                shares: ledger.shares.map((s) => ({ party: s.party, amount: fromCents(s.amountCents) })),
                split_id: split.id,
                trip_id: trip.id,
                created_by: user!.id,
            });
            await db.expenses.put(expense);
            onCreated(expense.id);
        } catch (error) {
            console.error('Error generating expense from trip:', error);
            showToast(mutationErrorMessage(error, 'Erro ao gerar despesa'), 'error');
        } finally {
            setCreating(false);
        }
    };

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title="Lançar despesa da viagem"
            subtitle={trip?.name}
            size="full"
            footer={
                <Button
                    block
                    size="lg"
                    disabled={loading || creating || totalCents <= 0 || !payerId}
                    onClick={handleConfirm}
                >
                    {creating ? 'A criar…' : 'Criar despesa'}
                </Button>
            }
        >
            {loading ? (
                <div className="py-12 text-center text-ink-faint">A carregar…</div>
            ) : !orders || orders.length === 0 ? (
                <div className="py-12 text-center text-ink-faint">
                    Esta viagem não tem itens comprados.
                </div>
            ) : (
                <div className="space-y-5">
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase text-ink-faint">Pago por</p>
                        <div className="flex flex-wrap gap-2">
                            {parties_.map((party) => (
                                <button
                                    key={party.id}
                                    type="button"
                                    onClick={() => setPayerId(party.id)}
                                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                                        payerId === party.id
                                            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
                                            : 'border-hairline text-ink-soft'
                                    }`}
                                >
                                    <Avatar name={party.name} src={partyAvatarUrl(party.id, parties)} size="xs" />
                                    {partyLabel(party.id, parties)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {orders.map((o) => (
                        <div key={o.order.id}>
                            <p className="mb-1 text-xs font-bold uppercase text-ink-faint">{o.label}</p>
                            <div className="rounded-2xl border border-hairline bg-surface divide-y divide-hairline">
                                {o.priced.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-3 py-2">
                                        <span className="text-sm text-ink">{item.name}</span>
                                        <span className="text-sm font-semibold text-ink">{formatEUR(item.price)}</span>
                                    </div>
                                ))}
                            </div>
                            {o.unpriced.length > 0 && (
                                <div className="mt-1 flex items-start gap-1.5 text-xs text-ink-faint">
                                    <Icon name="help_outline" className="mt-0.5 shrink-0 text-sm" />
                                    <span>
                                        Ignorados (sem preço): {o.unpriced.map((i) => i.name).join(', ')}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}

                    {unpricedCount > 0 && (
                        <p className="rounded-xl bg-warning-bg px-3 py-2 text-xs text-warning-fg">
                            {unpricedCount} {unpricedCount === 1 ? 'item ignorado' : 'itens ignorados'} por
                            não ter preço definido.
                        </p>
                    )}

                    <div className="flex items-center justify-between border-t border-hairline pt-3">
                        <span className="font-bold text-ink">Total</span>
                        <Money value={totalCents / 100} className="text-lg font-bold text-ink" />
                    </div>

                    {totalCents <= 0 && (
                        <p className="rounded-xl bg-warning-bg px-3 py-2 text-xs text-warning-fg">
                            Nenhum item tem preço, por isso não dá para criar a despesa.
                        </p>
                    )}
                </div>
            )}
        </Sheet>
    );
}
