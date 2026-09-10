'use client';

import { useState, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { tripsApi, ordersApi, itemsApi } from '@/lib/pocketbase';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import type { Trip, Item, Order, User } from '@/lib/types';
import { db } from '@/lib/db/schema';
import { useTrip, useOrders, useItems } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import {
    assertOnline,
    optimisticEdit,
    optimisticDelete,
    mutationErrorMessage,
} from '@/lib/db/mutations';
import { useOnline } from '@/hooks/useOnline';
import { useWebHaptics } from 'web-haptics/react';
import { cn, formatRelativeOrDate } from '@/lib/utils';
import {
    getOtherParticipants,
    deriveOrderUserName,
    inferAudienceType,
    getUserAvatarUrl,
    buildOrderCreatePayload,
    getOrderPlacedByLabel,
    type OrderAudienceType,
} from '@/lib/orderParticipants';
import { MoveItemSheet } from '@/components/features/MoveItemSheet';
import { isSheetActive, type SheetSession } from '@/lib/sheetSession';
import { useUnsavedDraftGuard } from '@/context/UnsavedDraftContext';
import { OrderParticipantsRow } from '@/components/features/OrderParticipantsRow';
import { OrderParticipantsSheet } from '@/components/features/OrderParticipantsSheet';
import { Sheet } from '@/components/ui/Sheet';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { OrderFormSheet, ItemFormData } from '@/components/features/OrderFormSheet';
import { AdminShoppingItemCard } from '@/components/features/AdminShoppingItemCard';
import dynamic from 'next/dynamic';
import { StickyActionCard } from '@/components/ui/StickyActionCard';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { Money } from '@/components/ui/Money';
const InvoiceScanSheet = dynamic(
    () => import('@/components/features/InvoiceScanSheet').then((m) => m.InvoiceScanSheet),
    { ssr: false }
);

interface ShoppingItem extends Item {
    user_name: string;
    order_id: string;
    order_created: string;
}

interface AdminOrderCard {
    orderId: string;
    orderCreated: string;
    creatorName: string;
    creatorUserId: string;
    creatorAvatar?: string;
    participantIds: string[];
    participantUsers: User[];
    items: ShoppingItem[];
}

function buildAdminOrderCard(order: Order, items: Item[], members: User[]): AdminOrderCard {
    const creator = order.expand?.user;
    const creatorUserId = order.user || creator?.id || '';
    let participantIds: string[] = [];
    let participantUsers: User[] = [];

    if (order.participants?.length) {
        participantIds = [...order.participants];
        participantUsers = order.expand?.participants || [];
    } else {
        const others = getOtherParticipants(order, creator?.id);
        participantIds = [
            ...(creatorUserId ? [creatorUserId] : []),
            ...others.map(p => p.id),
        ];
        participantUsers = [...(creator ? [creator] : []), ...others];
    }

    const creatorName = getOrderPlacedByLabel(order, members);

    return {
        orderId: order.id,
        orderCreated: order.created,
        creatorName,
        creatorUserId,
        creatorAvatar: creatorUserId
            ? getUserAvatarUrl(
                creatorUserId,
                creator?.avatar ?? members.find(m => m.id === creatorUserId)?.avatar
            )
            : undefined,
        participantIds,
        participantUsers,
        items: items
            .map(item => ({
                ...item,
                user_name: creatorName,
                order_id: order.id,
                order_created: order.created,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
}

export default function AdminTripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
    const { tripId } = use(params);
    const { user, updateProfile } = useUser();
    const { currentGroup } = useGroup();
    const online = useOnline();

    const tripQuery = useTrip(tripId);
    const trip = tripQuery ?? null;
    const tripOrders = useOrders(tripId);
    const orderIds = useMemo(() => (tripOrders ?? []).map((o) => o.id), [tripOrders]);
    const tripItems = useItems(orderIds);

    const [showScanSheet, setShowScanSheet] = useState(false);
    const [compactView, setCompactView] = useState(false);

    // Modals
    const [showEditItemModal, setShowEditItemModal] = useState(false);
    const [newOrderSession, setNewOrderSession] = useState<SheetSession>('closed');
    const [participantsSheetSession, setParticipantsSheetSession] = useState<SheetSession>('closed');
    const [newOrderDraftActive, setNewOrderDraftActive] = useState(false);
    const [moveItemDraftActive, setMoveItemDraftActive] = useState(false);
    const [participantsSheetDraftActive, setParticipantsSheetDraftActive] = useState(false);
    const [participantsSheetOrderId, setParticipantsSheetOrderId] = useState<string | null>(null);
    const [moveItem, setMoveItem] = useState<ShoppingItem | null>(null);
    const [moveSourceOrderId, setMoveSourceOrderId] = useState('');
    const [moveItemSession, setMoveItemSession] = useState<SheetSession>('closed');

    // Edit Item Form
    const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null);

    // Membros do grupo (do GroupContext, alimentado pela cache local).
    const members = useMemo<User[]>(() => {
        const list: User[] = [];
        if (currentGroup?.expand?.creator) list.push(currentGroup.expand.creator);
        if (currentGroup?.expand?.admins) list.push(...currentGroup.expand.admins);
        if (currentGroup?.expand?.members) list.push(...currentGroup.expand.members);
        return Array.from(new Map(list.map((m) => [m.id, m])).values());
    }, [currentGroup]);

    const [submitting, setSubmitting] = useState(false);
    const [comboboxOpen, setComboboxOpen] = useState(false);

    // Filter & Sort State
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'found' | 'not_available'>('all');
    const [priceFilter, setPriceFilter] = useState<'all' | 'with_price' | 'no_price'>('all');

    const editInitialItems = useMemo((): ItemFormData[] => {
        if (!selectedItem) return [];
        const brand: ItemFormData['brand'] =
            selectedItem.brand === 'Official' || selectedItem.brand === 'Off-brand'
                ? selectedItem.brand
                : '';
        return [{
            name: selectedItem.name,
            quantity: selectedItem.quantity,
            unit_price: selectedItem.unit_price || (selectedItem.price / selectedItem.quantity) || 0,
            brand,
            notes: selectedItem.notes || '',
            image_url: selectedItem.image_url || '',
            found_status: selectedItem.found_status,
        }];
    }, [selectedItem]);

    // Cartões de pedido derivados da cache local (orders + items + membros).
    const orderCards = useMemo<AdminOrderCard[]>(() => {
        const orders = tripOrders ?? [];
        const itemsByOrder = new Map<string, Item[]>();
        for (const item of tripItems ?? []) {
            const list = itemsByOrder.get(item.order_id) ?? [];
            list.push(item);
            itemsByOrder.set(item.order_id, list);
        }
        return orders.map((order) =>
            buildAdminOrderCard(order, itemsByOrder.get(order.id) ?? [], members),
        );
    }, [tripOrders, tripItems, members]);

    const participantsSheetOrder = participantsSheetOrderId
        ? orderCards.find(o => o.orderId === participantsSheetOrderId)
        : null;

    const sortedOrderCards = useMemo(() => {
        return [...orderCards].sort((a, b) => {
            const timeA = new Date(a.orderCreated).getTime();
            const timeB = new Date(b.orderCreated).getTime();
            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });
    }, [orderCards, sortOrder]);

    const moveOrderOptions = useMemo(() => {
        const total = sortedOrderCards.length;
        return sortedOrderCards.map((card, idx) => {
            const orderNumber = total - idx;
            const perspectiveId = card.creatorUserId || card.participantIds[0] || '';
            return {
                orderId: card.orderId,
                label: `Pedido ${orderNumber}`,
                participantIds: card.participantIds,
                itemCount: card.items.length,
                creatorUserId: card.creatorUserId,
            };
        });
    }, [sortedOrderCards]);
    const { showToast } = useToast();
    const router = useRouter();
    const { trigger } = useWebHaptics();

    const cycleStatus = async (item: ShoppingItem, e: React.MouseEvent) => {
        e.stopPropagation();
        trigger();
        const statuses: Item['found_status'][] = ['pending', 'found', 'not_available'];
        const currentIdx = statuses.indexOf(item.found_status);
        const nextStatus = statuses[(currentIdx + 1) % 3];

        try {
            await optimisticEdit({
                table: db.items,
                id: item.id,
                patch: { found_status: nextStatus },
                commit: () => itemsApi.updateStatus(item.id, nextStatus),
            });
        } catch (err) {
            showToast(mutationErrorMessage(err, 'Falha ao atualizar estado do produto'), 'error');
        }
    };

    const openEditItemModal = (item: ShoppingItem) => {
        setSelectedItem(item);
        setShowEditItemModal(true);
    };

    const openNewOrder = () => {
        if (newOrderSession === 'minimized') {
            setNewOrderSession('expanded');
            return;
        }
        if (!online) {
            showToast('Sem ligação — precisas de rede para criar um pedido.', 'error');
            return;
        }
        setNewOrderSession('expanded');
    };

    const openParticipantsSheet = (orderId: string) => {
        if (participantsSheetSession === 'minimized' && participantsSheetOrderId === orderId) {
            setParticipantsSheetSession('expanded');
            return;
        }
        setParticipantsSheetOrderId(orderId);
        setParticipantsSheetSession('expanded');
    };

    const openMoveItem = (item: ShoppingItem, sourceOrderId: string) => {
        setMoveItem(item);
        setMoveSourceOrderId(sourceOrderId);
        setMoveItemSession('expanded');
        setShowEditItemModal(false);
    };

    const handleItemMoved = () => {
        setMoveItem(null);
        setMoveSourceOrderId('');
        setMoveItemSession('closed');
        setSelectedItem(null);
        // A escrita optimista no Dexie + o eco do realtime tratam da lista.
    };

    const handleUpdateItem = async (data: { items: ItemFormData[] }) => {
        if (!selectedItem) return;
        setSubmitting(true);
        const itemData = data.items[0];
        const qty = Number(itemData.quantity) || 1;
        const uPrice = Number(itemData.unit_price) || 0;

        const patch = {
            name: itemData.name,
            quantity: qty,
            unit_price: uPrice,
            price: uPrice * qty,
            found_status: itemData.found_status,
            brand: itemData.brand ?? '',
            notes: itemData.notes ?? '',
        };
        try {
            await optimisticEdit({
                table: db.items,
                id: selectedItem.id,
                patch,
                commit: () => itemsApi.update(selectedItem.id, patch),
            });
            setShowEditItemModal(false);
        } catch (err) {
            showToast(mutationErrorMessage(err, 'Falha ao atualizar produto'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteItem = async () => {
        if (!selectedItem || !confirm('Tem a certeza de que quer eliminar este produto?')) return;
        trigger('error');
        setSubmitting(true);
        const orderId = selectedItem.order_id;
        // O pedido fica vazio se este era o último item em cache.
        const siblingsLeft = (await db.items.where('order_id').equals(orderId).count()) - 1;
        try {
            await optimisticDelete({
                table: db.items,
                id: selectedItem.id,
                cascade:
                    siblingsLeft <= 0 ? [{ table: db.orders, id: orderId }] : [],
                commit: () =>
                    itemsApi.deleteAndPruneEmptyOrder(selectedItem.id, orderId),
            });
            showToast(
                siblingsLeft <= 0
                    ? 'Produto eliminado — pedido vazio removido'
                    : 'Produto eliminado',
                'success',
            );
            setShowEditItemModal(false);
            setSelectedItem(null);
        } catch (err) {
            showToast(mutationErrorMessage(err, 'Falha ao eliminar produto'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveOrderParticipants = async (participantIds: string[], creatorUserId?: string) => {
        if (!participantsSheetOrder) return;

        const perspectiveId = creatorUserId || participantsSheetOrder.creatorUserId || participantIds[0] || '';
        const audienceType = inferAudienceType(participantIds, members, perspectiveId);
        const userName = deriveOrderUserName(participantIds, members, audienceType);

        setSubmitting(true);
        try {
            const updatePayload: Partial<Order> = {
                participants: participantIds,
                user_name: userName,
            };
            if (creatorUserId && creatorUserId !== participantsSheetOrder.creatorUserId) {
                updatePayload.user = creatorUserId;
            } else if (!participantsSheetOrder.creatorUserId && !creatorUserId && user?.id) {
                updatePayload.user = user.id;
            }
            await optimisticEdit({
                table: db.orders,
                id: participantsSheetOrder.orderId,
                patch: updatePayload,
                commit: () => ordersApi.update(participantsSheetOrder.orderId, updatePayload),
            });
            setParticipantsSheetOrderId(null);
            setParticipantsSheetSession('closed');
        } catch (error) {
            console.error('Error:', error);
            showToast(mutationErrorMessage(error, 'Erro ao guardar participantes'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const discardAllDrafts = useCallback(() => {
        setNewOrderSession('closed');
        setMoveItem(null);
        setMoveSourceOrderId('');
        setMoveItemSession('closed');
        setParticipantsSheetOrderId(null);
        setParticipantsSheetSession('closed');
    }, []);

    const hasUnsavedMinimizableDraft =
        (isSheetActive(newOrderSession) && newOrderDraftActive) ||
        (isSheetActive(moveItemSession) && moveItemDraftActive) ||
        (isSheetActive(participantsSheetSession) && participantsSheetDraftActive);

    useUnsavedDraftGuard(hasUnsavedMinimizableDraft, discardAllDrafts);

    const handleNewOrder = async (data: {
        items: ItemFormData[];
        userId?: string;
        userName?: string;
        participantIds?: string[];
        audienceType?: OrderAudienceType;
    }) => {
        const participantIds = data.participantIds?.length
            ? data.participantIds
            : data.userId
                ? [data.userId]
                : data.userName?.trim() === 'Geral'
                    ? members.map(m => m.id)
                    : [];

        if (participantIds.length === 0) {
            showToast('Indica quem participa no pedido', 'error');
            return;
        }

        const audienceType: OrderAudienceType = data.audienceType
            ?? inferAudienceType(participantIds, members, user?.id || participantIds[0] || '');

        setSubmitting(true);
        try {
            assertOnline();
            const createPayload = buildOrderCreatePayload({
                tripId,
                participantIds,
                members,
                audienceType,
                createdByUserId: user?.id || participantIds[0] || '',
            });
            const order = await ordersApi.create(createPayload);

            const createdItems = await Promise.all(
                data.items
                    .filter((item) => item.name.trim())
                    .map((item) =>
                        itemsApi.create({
                            order_id: order.id,
                            name: item.name.trim(),
                            quantity: item.quantity,
                            price: (item.unit_price || 0) * item.quantity,
                            unit_price: item.unit_price,
                            brand: item.brand,
                            notes: item.notes,
                            image_url: item.image_url,
                        }),
                    ),
            );

            await db.orders.put(order);
            if (createdItems.length) await db.items.bulkPut(createdItems);

            setNewOrderSession('closed');
        } catch (err) {
            showToast(mutationErrorMessage(err, 'Falha ao criar pedido'), 'error');
        } finally {
            setSubmitting(false);
        }
    };



    const NEUTRAL_PILL = 'bg-surface border-hairline text-ink-soft';
    const getStatusFilterConfig = (status: typeof statusFilter) => {
        switch (status) {
            case 'all': return { label: 'Todos', color: NEUTRAL_PILL };
            case 'pending': return { label: 'Por comprar', color: 'bg-warning-bg text-warning-fg border-warning-fg/25' };
            case 'found': return { label: 'Comprados', color: 'bg-success-bg text-success-fg border-success-fg/25' };
            case 'not_available': return { label: 'Não tinha', color: 'bg-danger-bg text-danger-fg border-danger-fg/25' };
        }
    };

    const cycleStatusFilter = () => {
        const order: typeof statusFilter[] = ['all', 'pending', 'found', 'not_available'];
        const nextIndex = (order.indexOf(statusFilter) + 1) % order.length;
        setStatusFilter(order[nextIndex]);
    };

    const getPriceFilterConfig = (status: typeof priceFilter) => {
        switch (status) {
            case 'all': return { label: 'Todos', color: NEUTRAL_PILL };
            case 'with_price': return { label: 'Com Preço', color: 'bg-info-bg text-info-fg border-info-fg/25' };
            case 'no_price': return { label: 'Sem Preço', color: 'bg-surface-sunken text-ink-soft border-hairline' };
        }
    };

    const cyclePriceFilter = () => {
        const order: typeof priceFilter[] = ['all', 'with_price', 'no_price'];
        const nextIndex = (order.indexOf(priceFilter) + 1) % order.length;
        setPriceFilter(order[nextIndex]);
    };

    // Calculate totals
    const allItems = orderCards.flatMap(o => o.items);

    const stats = {
        total: allItems.length,
        pending: allItems.filter(i => i.found_status === 'pending').length,
    };
    const boughtCost = allItems.filter(i => i.found_status === 'found').reduce((s, i) => s + (i.price || 0), 0);

    const handleCloseTrip = async () => {
        if (!confirm('Tens a certeza que queres terminar a viagem?')) return;
        if (!trip) return;

        try {
            await optimisticEdit({
                table: db.trips,
                id: tripId,
                patch: { status: 'closed' },
                commit: () => tripsApi.update(tripId, { status: 'closed' }),
            });
            showToast('Viagem terminada! Podes agora criar a divisão de contas.', 'success');

            // Notify Users
            await fetch('/api/notify', {
                method: 'POST',
                body: JSON.stringify({
                    groupId: trip.group_id,
                    title: '🏁 Viagem Concluída',
                    message: `As compras de "${trip.name}" foram terminadas. Abre para ver quanto ficou a tua parte!`,
                    url: `/groups/${trip.group_id}/trips/${trip.id}`
                })
            }).catch(console.error);

        } catch (err) {
            showToast(mutationErrorMessage(err, 'Erro ao atualizar viagem'), 'error');
        }
    };

    const handleLockTrip = async () => {
        if (!confirm('Tens a certeza que queres fechar a trip para novos pedidos?')) return;
        if (!trip) return;

        try {
            await optimisticEdit({
                table: db.trips,
                id: tripId,
                patch: { status: 'in_progress' },
                commit: () => tripsApi.update(tripId, { status: 'in_progress' }),
            });
            showToast('Viagem fechada a novos pedidos', 'success');

            // Notify Users
            await fetch('/api/notify', {
                method: 'POST',
                body: JSON.stringify({
                    groupId: trip.group_id,
                    title: '🛒 Vamos às compras!',
                    message: `A viagem "${trip.name}" já não aceita mais novos pedidos.`,
                    url: `/groups/${trip.group_id}/trips/${trip.id}`
                })
            }).catch(console.error);

        } catch (err) {
            showToast(mutationErrorMessage(err, 'Erro ao atualizar viagem'), 'error');
        }
    };

    // Card Logic
    const allItemsCompleted = allItems.length > 0 &&
        allItems.every(i => i.found_status !== 'pending') &&
        allItems.filter(i => i.found_status === 'found').every(i => i.price !== 0);

    // Determine card state
    let stickyCardProps = null;

    if (!trip) return null;

    if (trip.status === 'open' && stats.total > 0) {
        stickyCardProps = {
            visible: true,
            title: "Fecha a viagem a novos pedidos!",
            actionLabel: "Começar Compras",
            onAction: handleLockTrip,
            color: "blue" // Default style
        };
    } else if (trip.status === 'in_progress' && allItemsCompleted) {
        stickyCardProps = {
            visible: true,
            title: "Todos os pedidos concluídos e com preço!",
            actionLabel: "Terminar Viagem",
            onAction: handleCloseTrip,
            color: "green" // Creating a green variant style logic if needed, or just default
        };
    }

    if (!trip) return null;

    const hasMinimizedDock =
        (newOrderSession === 'minimized' && newOrderDraftActive) ||
        (moveItemSession === 'minimized' && moveItemDraftActive) ||
        (participantsSheetSession === 'minimized' && participantsSheetDraftActive);

    return (
        <div className="min-h-screen bg-app has-bottom-nav">
            {stickyCardProps && (
                <StickyActionCard
                    visible={true}
                    title={stickyCardProps.title}
                    actionLabel={stickyCardProps.actionLabel}
                    onAction={stickyCardProps.onAction}
                    stackAboveMinimized={hasMinimizedDock}
                />
            )}
            <Header title={trip.name} subtitle="Admin" showBack />

            <main className="container mx-auto px-4 py-8 max-w-2xl">
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <StatCard label="Total Produtos" value={stats.total} />
                    <StatCard label="Por comprar" value={stats.pending} tone="warning" />
                    <StatCard label="Gasto Atual" value={<Money value={boughtCost} />} tone="success" />
                </div>

                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-ink">Pedidos</h2>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setCompactView(v => !v)}
                            className={cn(
                                'h-10 w-10 rounded-full flex items-center justify-center shadow-sm transition-colors active:scale-95',
                                compactView
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'bg-surface border border-hairline text-ink-faint hover:text-primary-600 hover:border-primary-300',
                            )}
                            title={compactView ? 'Ver detalhado' : 'Ver resumo'}
                        >
                            <Icon name={compactView ? 'view_agenda' : 'checklist'} className="text-xl" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowScanSheet(true)}
                            className="h-10 w-10 rounded-full flex items-center justify-center bg-primary-600 text-white hover:bg-primary-700 shadow-sm transition-colors active:scale-95"
                            title="Scan da fatura (Gemini)"
                        >
                            <Icon name="receipt_long" className="text-xl" />
                        </button>
                        <Button size="sm" onClick={openNewOrder}>
                            + Novo Pedido
                        </Button>
                    </div>
                </div>

                {/* Filters & Sort */}
                <div className="mb-6 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                    {/* Sort Pill */}
                    <button
                        onClick={() => setSortOrder(current => current === 'desc' ? 'asc' : 'desc')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap bg-surface border-hairline text-ink-soft hover:bg-surface-sunken active:scale-95"
                    >
                        <Icon name="schedule" className="text-sm" />
                        {sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos'}
                    </button>

                    {/* Status Cycle Button */}
                    <button
                        onClick={cycleStatusFilter}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap active:scale-95",
                            getStatusFilterConfig(statusFilter).color
                        )}
                    >
                        <Icon name="filter_list" className="text-sm" />
                        {getStatusFilterConfig(statusFilter).label}
                    </button>

                    {/* Price Cycle Button */}
                    <button
                        onClick={cyclePriceFilter}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap active:scale-95",
                            getPriceFilterConfig(priceFilter).color
                        )}
                    >
                        <Icon name="attach_money" className="text-sm" />
                        {getPriceFilterConfig(priceFilter).label}
                    </button>
                </div>

                {/* Shopping List — one card per order */}
                <div className="space-y-6">
                    {orderCards.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center">
                            <div className="w-20 h-20 mb-4 rounded-full bg-primary-50 dark:bg-primary-950 flex items-center justify-center text-primary-500">
                                <Icon name="shopping_cart" className="text-3xl" />
                            </div>
                            <h3 className="text-lg font-bold text-ink mb-1">Lista Vazia</h3>
                            <p className="text-ink-soft text-sm mb-6">Nenhum produto pedido para esta viagem.</p>
                        </div>
                    ) : (
                        sortedOrderCards
                            .map((orderCard, idx) => {
                                const filteredItems = orderCard.items.filter(item => {
                                    // Status Filter
                                    if (statusFilter !== 'all' && item.found_status !== statusFilter) return false;

                                    // Price Filter
                                    if (priceFilter === 'with_price' && (item.price || 0) <= 0) return false;
                                    if (priceFilter === 'no_price' && (item.price || 0) > 0) return false;

                                    return true;
                                });

                                if (filteredItems.length === 0) return null;

                                const allProcessed = filteredItems.length > 0 && filteredItems.every(i => i.found_status !== 'pending');
                                const allMissing = filteredItems.length > 0 && filteredItems.every(i => i.found_status === 'not_available');
                                const orderNumber = sortedOrderCards.length - idx;

                                return (
                                    <div key={orderCard.orderId} className={cn(
                                        "cv-auto rounded-[24px] shadow-sm overflow-hidden",
                                        allProcessed ? "p-[3px]" : "border border-hairline",
                                        allProcessed ? (allMissing ? "bg-danger" : "bg-primary-600") : "bg-surface"
                                    )}>
                                        <div className={cn("bg-surface overflow-hidden h-full flex flex-col", allProcessed ? "rounded-[21px]" : "")}>
                                            {allProcessed && (
                                                <div className={cn(
                                                    "py-1.5 px-4 flex items-center justify-center gap-2 text-xs font-bold text-white uppercase tracking-wider select-none",
                                                    allMissing ? "bg-danger" : "bg-primary-600"
                                                )}>
                                                    {allMissing ? <span className="text-sm">💀</span> : <Icon name="check_circle" className="text-sm" />}
                                                    {allMissing ? "Não havia um caralho do que tu querias" : "Pedido concluído"}
                                                </div>
                                            )}
                                            {/* Order header */}
                                            {compactView ? (
                                                <div className="px-4 py-2 border-b border-hairline flex items-center justify-between gap-2 bg-surface-sunken relative z-10">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Avatar
                                                            name={orderCard.creatorName}
                                                            src={orderCard.creatorAvatar}
                                                            size="sm"
                                                        />
                                                        <p className="text-sm font-bold text-ink truncate">
                                                            Por {orderCard.creatorName}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-black text-ink shrink-0">
                                                        <Money value={filteredItems.reduce((acc, item) => acc + (item.price || 0), 0)} />
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="p-4 border-b border-hairline flex items-center justify-between bg-surface-sunken relative z-10">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Avatar
                                                            name={orderCard.creatorName}
                                                            src={orderCard.creatorAvatar}
                                                            size="md"
                                                        />
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-ink text-lg leading-none mb-1">
                                                                Pedido {orderNumber}
                                                            </h3>
                                                            <p className="text-xs text-ink-faint font-medium">
                                                                Por {orderCard.creatorName} • {filteredItems.length}{' '}
                                                                {filteredItems.length === 1 ? 'item' : 'itens'}
                                                                {statusFilter !== 'all' && ' visíveis'} •{' '}
                                                                {formatRelativeOrDate(orderCard.orderCreated)}
                                                            </p>
                                                            <OrderParticipantsRow
                                                                participantIds={orderCard.participantIds}
                                                                members={members}
                                                                perspectiveUserId={
                                                                    orderCard.creatorUserId ||
                                                                    orderCard.participantIds[0] ||
                                                                    ''
                                                                }
                                                                currentUserId={user?.id || ''}
                                                                expandedParticipants={orderCard.participantUsers}
                                                                namedPerspective
                                                                alwaysClickable
                                                                onClick={() =>
                                                                    openParticipantsSheet(orderCard.orderId)
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-ink-faint font-bold uppercase tracking-wider mb-0.5">Total</p>
                                                        <p className="text-sm font-black text-ink">
                                                            <Money value={filteredItems.reduce((acc, item) => acc + (item.price || 0), 0)} />
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Items List */}
                                            <div className="bg-surface-sunken p-2 gap-2 flex flex-col">
                                                {filteredItems.map((item) => (
                                                    <AdminShoppingItemCard
                                                        key={item.id}
                                                        item={item}
                                                        compact={compactView}
                                                        onOpenEdit={() => openEditItemModal(item)}
                                                        onCycleStatus={(e) => cycleStatus(item, e)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                    )}
                </div>
            </main>

            <InvoiceScanSheet
                isOpen={showScanSheet}
                onClose={() => setShowScanSheet(false)}
                tripId={tripId}
                orderCards={orderCards}
                members={members}
                user={user}
                updateProfile={updateProfile}
                onApplied={() => void catchUp()}
            />

            {/* New Order Sheet */}
            <OrderFormSheet
                isOpen={isSheetActive(newOrderSession)}
                onClose={() => setNewOrderSession('closed')}
                onSubmit={handleNewOrder}
                title="Novo Pedido"
                submitLabel="Criar Pedido"
                submitting={submitting}
                mode="multi"
                flow="create"
                isAdmin={true}
                groupMembers={members}
                currentUserId={user?.id || ''}
                minimized={newOrderSession === 'minimized'}
                onMinimize={() => setNewOrderSession('minimized')}
                onExpand={() => setNewOrderSession('expanded')}
                onDiscard={() => setNewOrderSession('closed')}
                onDraftActiveChange={setNewOrderDraftActive}
            />

            {/* Edit Item Sheet */}
            <OrderFormSheet
                isOpen={showEditItemModal}
                onClose={() => setShowEditItemModal(false)}
                onSubmit={handleUpdateItem}
                initialItems={editInitialItems}
                title="Editar Produto"
                submitLabel="Guardar"
                submitting={submitting}
                onDelete={handleDeleteItem}
                onMoveToOtherOrder={
                    selectedItem
                        ? () => openMoveItem(selectedItem, selectedItem.order_id)
                        : undefined
                }
                mode="single"
                isAdmin={true}
            />

            <MoveItemSheet
                isOpen={!!moveItem}
                onClose={() => {
                    setMoveItem(null);
                    setMoveSourceOrderId('');
                    setMoveItemSession('closed');
                }}
                item={moveItem}
                sourceOrderId={moveSourceOrderId}
                tripId={tripId}
                groupMembers={members}
                currentUserId={user?.id || ''}
                orderOptions={moveOrderOptions}
                onMoved={handleItemMoved}
                minimized={moveItemSession === 'minimized'}
                onMinimize={() => setMoveItemSession('minimized')}
                onExpand={() => setMoveItemSession('expanded')}
                onDiscard={() => {
                    setMoveItem(null);
                    setMoveSourceOrderId('');
                    setMoveItemSession('closed');
                }}
                onDraftActiveChange={setMoveItemDraftActive}
            />

            <OrderParticipantsSheet
                isOpen={isSheetActive(participantsSheetSession)}
                onClose={() => {
                    setParticipantsSheetOrderId(null);
                    setParticipantsSheetSession('closed');
                }}
                title="Quem participa?"
                groupMembers={members}
                participantIds={participantsSheetOrder?.participantIds ?? []}
                allowCreatorChange
                creatorUserId={participantsSheetOrder?.creatorUserId ?? ''}
                onSave={handleSaveOrderParticipants}
                submitting={submitting}
                minimized={participantsSheetSession === 'minimized'}
                onMinimize={() => setParticipantsSheetSession('minimized')}
                onExpand={() => setParticipantsSheetSession('expanded')}
                onDiscard={() => {
                    setParticipantsSheetOrderId(null);
                    setParticipantsSheetSession('closed');
                }}
                onDraftActiveChange={setParticipantsSheetDraftActive}
            />
        </div >
    );
}

