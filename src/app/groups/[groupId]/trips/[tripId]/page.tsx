'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useEditTimer } from '@/hooks/useEditTimer';
import { ordersApi, itemsApi } from '@/lib/pocketbase';
import type { Item, OrderWithItems, User } from '@/lib/types';
import { useTrip, useOrders, useItems } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { db } from '@/lib/db/schema';
import {
    assertOnline,
    optimisticEdit,
    optimisticDelete,
    mutationErrorMessage,
} from '@/lib/db/mutations';
import { useSyncStatus } from '@/context/SyncProvider';
import { useOnline } from '@/hooks/useOnline';
import {
    orderVisibleToUser,
    deriveOrderUserName,
    inferAudienceType,
    partitionOrdersForUser,
    isOrderCreatedByUser,
    buildOrderCreatePayload,
    getOrderPlacedByLabel,
} from '@/lib/orderParticipants';
import { OrderParticipantsRow } from '@/components/features/OrderParticipantsRow';
import { OrderParticipantsSheet } from '@/components/features/OrderParticipantsSheet';
import { getRelativeTime, formatCurrency, isOrderEditable, getRemainingEditTime, formatTime, cn, getProductEmoji } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Sheet } from '@/components/ui/Sheet';
import { useGroup } from '@/context/GroupContext';

import { OrderFormSheet, ItemFormData } from '@/components/features/OrderFormSheet';
import { ShoppingItemMeta } from '@/components/features/ShoppingItemMeta';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { isSheetActive, hasAnyActiveSheet, type SheetSession } from '@/lib/sheetSession';
import { getFabBottom } from '@/lib/bottomDock';
import { useUnsavedDraftGuard } from '@/context/UnsavedDraftContext';

export default function GroupTripDetailPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const tripId = params.tripId as string;
    const router = useTransitionRouter();
    const { user, isLoggedIn } = useUser();
    const { isAdmin, currentGroup } = useGroup();
    const { showToast } = useToast();
    const { startTimer } = useEditTimer();
    const online = useOnline();

    const userName = user?.name || user?.email || 'Anónimo';

    const [orderSheetSession, setOrderSheetSession] = useState<SheetSession>('closed');
    const [participantsSheetSession, setParticipantsSheetSession] = useState<SheetSession>('closed');
    const [orderSheetDraftActive, setOrderSheetDraftActive] = useState(false);
    const [participantsSheetDraftActive, setParticipantsSheetDraftActive] = useState(false);
    const [participantsSheetOrderId, setParticipantsSheetOrderId] = useState<string | null>(null);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [initialFormItems, setInitialFormItems] = useState<ItemFormData[]>([]);
    const [initialParticipantIds, setInitialParticipantIds] = useState<string[]>([]);
    const [ordersTab, setOrdersTab] = useState<'mine' | 'participating' | 'others'>('mine');

    const groupMembers: User[] = currentGroup?.expand?.members ?? [];
    const currentUserId = user?.id || '';
    const [currentTime, setCurrentTime] = useState(Date.now());

    // Timer updates
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const showAllOrders = Boolean(currentGroup?.show_all_orders);

    const tripQuery = useTrip(tripId);
    const trip = tripQuery ?? null;
    const allOrders = useOrders(tripId);
    const orderIds = useMemo(() => (allOrders ?? []).map((o) => o.id), [allOrders]);
    const allItems = useItems(orderIds);
    const { groupSyncing } = useSyncStatus();

    const loading = tripQuery === undefined || (trip === null && groupSyncing);

    const { orders, otherOrders } = useMemo(() => {
        const ordersData = allOrders ?? [];
        const items = allItems ?? [];
        const itemsByOrder = new Map<string, Item[]>();
        for (const item of items) {
            const list = itemsByOrder.get(item.order_id) ?? [];
            list.push(item);
            itemsByOrder.set(item.order_id, list);
        }
        const attach = (list: typeof ordersData): OrderWithItems[] =>
            list
                .slice()
                .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
                .map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }));

        const mine = attach(
            ordersData.filter((order) => orderVisibleToUser(order, currentUserId, userName)),
        );
        const others = showAllOrders
            ? attach(
                  ordersData.filter(
                      (order) => !orderVisibleToUser(order, currentUserId, userName),
                  ),
              )
            : [];
        return { orders: mine, otherOrders: others };
    }, [allOrders, allItems, currentUserId, userName, showAllOrders]);

    const { mine: myOrders, participating: participatingOrders } = useMemo(
        () => partitionOrdersForUser(orders, currentUserId),
        [orders, currentUserId]
    );

    const displayedOrders =
        ordersTab === 'mine' ? myOrders : ordersTab === 'participating' ? participatingOrders : otherOrders;

    // Stats (all orders visible to this user)
    const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);
    const estimatedCost = orders.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => {
            const cost = (item.unit_price || 0) * (item.quantity || 1) || item.price || 0;
            return itemSum + cost;
        }, 0), 0
    );

    const openNewOrder = () => {
        if (orderSheetSession === 'minimized') {
            setOrderSheetSession('expanded');
            return;
        }
        if (!online) {
            showToast('Sem ligação — precisas de rede para criar um pedido.', 'error');
            return;
        }
        setEditingOrderId(null);
        setInitialFormItems([]);
        setInitialParticipantIds([]);
        setOrderSheetSession('expanded');
    };

    const openParticipantsSheet = (orderId: string) => {
        if (participantsSheetSession === 'minimized' && participantsSheetOrderId === orderId) {
            setParticipantsSheetSession('expanded');
            return;
        }
        setParticipantsSheetOrderId(orderId);
        setParticipantsSheetSession('expanded');
    };

    const handleOrderSubmit = async (data: {
        items: ItemFormData[];
        participantIds?: string[];
        audienceType?: 'me' | 'several' | 'all';
    }) => {
        setSubmitting(true);
        try {
            assertOnline();
            if (editingOrderId) {
                const existing = orders.find(o => o.id === editingOrderId);
                const validItems = data.items.filter(i => i.name.trim());

                if (validItems.length === 0) {
                    if (existing) {
                        for (const item of existing.items) await itemsApi.delete(item.id);
                    }
                    await ordersApi.delete(editingOrderId);
                    showToast('Pedido eliminado (sem produtos)', 'success');
                } else if (existing) {
                    for (const item of existing.items) await itemsApi.delete(item.id);
                    for (const item of validItems) {
                        await itemsApi.create({
                            order_id: editingOrderId,
                            name: item.name,
                            quantity: item.quantity,
                            brand: item.brand,
                            notes: item.notes,
                            price: item.quantity * item.unit_price,
                            image_url: item.image_url,
                        });
                    }
                    showToast('Pedido atualizado!', 'success');
                }
            } else {
                const participantIds = data.participantIds?.length
                    ? data.participantIds
                    : [currentUserId];
                const audienceType = data.audienceType || 'me';
                const createPayload = buildOrderCreatePayload({
                    tripId,
                    participantIds,
                    members: groupMembers,
                    audienceType,
                    createdByUserId: currentUserId,
                });
                const order = await ordersApi.create(createPayload);
                startTimer(order.id, order.can_edit_until);
                const createdItems: Item[] = [];
                for (const item of data.items) {
                    createdItems.push(
                        await itemsApi.create({
                            order_id: order.id,
                            name: item.name,
                            quantity: item.quantity,
                            brand: item.brand,
                            notes: item.notes,
                            price: item.quantity * item.unit_price,
                            image_url: item.image_url,
                        }),
                    );
                }
                // Persiste já a resposta do servidor (ids reais) — sem esperar o eco.
                await db.orders.put(order);
                if (createdItems.length) await db.items.bulkPut(createdItems);
                showToast('Pedido criado!', 'success');
            }
            setEditingOrderId(null);
            setOrderSheetSession('closed');
            void catchUp();
        } catch (error) {
            console.error('Error:', error);
            showToast(mutationErrorMessage(error, 'Erro ao guardar pedido'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (order: OrderWithItems) => {
        if (!isOrderCreatedByUser(order, currentUserId)) return;
        if (!isOrderEditable(order.can_edit_until)) {
            showToast('Limite de 5 minutos excedido', 'error');
            return;
        }
        setEditingOrderId(order.id);
        setInitialParticipantIds(order.participants?.length ? order.participants : []);
        setInitialFormItems(order.items.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price || i.price / i.quantity || 0,
            brand:
                i.brand === 'Official' || i.brand === 'Off-brand'
                    ? (i.brand as 'Official' | 'Off-brand')
                    : '',
            notes: i.notes || '',
            image_url: i.image_url || '',
        })));
        setOrderSheetSession('expanded');
    };

    const participantsSheetOrder = participantsSheetOrderId
        ? orders.find(o => o.id === participantsSheetOrderId)
        : null;
    const participantsSheetEditable = Boolean(
        participantsSheetOrder &&
        isOrderEditable(participantsSheetOrder.can_edit_until) &&
        (participantsSheetOrder.user === currentUserId ||
            participantsSheetOrder.expand?.user?.id === currentUserId)
    );

    const discardAllDrafts = useCallback(() => {
        setOrderSheetSession('closed');
        setParticipantsSheetOrderId(null);
        setParticipantsSheetSession('closed');
        setEditingOrderId(null);
        setInitialFormItems([]);
        setInitialParticipantIds([]);
    }, []);

    const hasUnsavedMinimizableDraft =
        (isSheetActive(orderSheetSession) && orderSheetDraftActive) ||
        (isSheetActive(participantsSheetSession) && participantsSheetDraftActive);

    useUnsavedDraftGuard(hasUnsavedMinimizableDraft, discardAllDrafts);

    const handleSaveParticipants = async (participantIds: string[]) => {
        if (!participantsSheetOrder) return;
        setSubmitting(true);
        try {
            const audienceType = inferAudienceType(participantIds, groupMembers, currentUserId);
            const updatePayload: Partial<OrderWithItems> = {
                participants: participantIds,
                user_name: deriveOrderUserName(participantIds, groupMembers, audienceType),
            };
            const creatorId = participantsSheetOrder.user || participantsSheetOrder.expand?.user?.id;
            if (!creatorId && currentUserId) {
                updatePayload.user = currentUserId;
            }
            await optimisticEdit({
                table: db.orders,
                id: participantsSheetOrder.id,
                patch: updatePayload,
                commit: () => ordersApi.update(participantsSheetOrder.id, updatePayload),
            });
            showToast('Participantes atualizados', 'success');
            setParticipantsSheetOrderId(null);
            setParticipantsSheetSession('closed');
        } catch (error) {
            console.error('Error:', error);
            showToast(mutationErrorMessage(error, 'Erro ao guardar participantes'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (orderId: string) => {
        const order = orders.find(o => o.id === orderId);
        if (!order || !isOrderCreatedByUser(order, currentUserId)) return;
        if (!isOrderEditable(order.can_edit_until)) {
            showToast('Limite de 5 minutos excedido', 'error');
            return;
        }
        if (!confirm('Eliminar este pedido?')) return;

        try {
            await optimisticDelete({
                table: db.orders,
                id: orderId,
                cascade: order.items.map((item) => ({ table: db.items, id: item.id })),
                commit: async () => {
                    for (const item of order.items) await itemsApi.delete(item.id);
                    await ordersApi.delete(orderId);
                },
            });
            showToast('Pedido eliminado', 'success');
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao eliminar'), 'error');
        }
    };

    const getStatusConfig = (status: Item['found_status']) => ({
        pending: { label: 'Por comprar', bg: 'bg-amber-500', icon: '⏳' },
        found: { label: 'Comprado', bg: 'bg-emerald-500', icon: '✓' },
        not_available: { label: 'Não tinha', bg: 'bg-red-500', icon: '✗' },
    }[status]);

    if (!isLoggedIn) return null;
    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)]">
                <Header showBack groupId={groupId} />
                <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
            </div>
        );
    }

    if (!trip) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)]">
                <Header showBack groupId={groupId} />
                <div className="text-center py-20">
                    <div className="text-6xl mb-4">😕</div>
                    <h2 className="text-xl font-bold mb-4">Viagem não encontrada</h2>
                    <button onClick={() => router.push(`/groups/${groupId}/trips`)} className="btn btn-primary px-6 py-3">
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    const hasMinimizedDock =
        (orderSheetSession === 'minimized' && orderSheetDraftActive) ||
        (participantsSheetSession === 'minimized' && participantsSheetDraftActive);

    return (
        <div className={cn('min-h-screen bg-[var(--bg-primary)]', isAdmin && 'has-bottom-nav')}>
            <Header showBack title={trip.name} subtitle={trip.description || 'Sem descrição'} groupId={groupId} />

            {trip.status !== 'open' && (
                <div className={cn(
                    "sticky top-[72px] md:top-[80px] z-30 w-full px-4 py-3 shadow-md flex items-center justify-center gap-2 font-bold text-sm animate-in slide-in-from-top-2",
                    trip.status === 'in_progress' ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                )}>
                    {trip.status === 'in_progress' ? (
                        <>
                            <span className="text-lg">🏃🛒</span>
                            <span>Estamos a comprar os teus pedidos!</span>
                        </>
                    ) : (
                        <>
                            <span className="text-lg">🔒</span>
                            <span>Esta viagem já terminou!</span>
                        </>
                    )}
                </div>
            )}

            <main className="container mx-auto px-4 py-6">
                {/* Stats */}
                {totalItems > 0 && (
                    <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in-up">
                        <div className="card p-4 text-center">
                            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                </svg>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mb-0.5">Produtos</p>
                            <p className="text-xl font-bold text-[var(--text-primary)]">{totalItems}</p>
                        </div>
                        <div className="card p-4 text-center">
                            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <span className="text-amber-600 dark:text-amber-400">€</span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mb-0.5">Estimado</p>
                            <p className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(estimatedCost)}</p>
                        </div>
                    </div>
                )}

                {/* Orders tabs */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 flex p-1 bg-[var(--bg-tertiary)] rounded-xl">
                        <button
                            type="button"
                            onClick={() => setOrdersTab('mine')}
                            className={cn(
                                'flex-1 py-2 px-2 text-sm font-medium rounded-lg transition-colors',
                                ordersTab === 'mine'
                                    ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            Os teus pedidos
                            {myOrders.length > 0 && (
                                <span className="ml-1.5 text-xs opacity-80">({myOrders.length})</span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOrdersTab('participating')}
                            className={cn(
                                'flex-1 py-2 px-2 text-sm font-medium rounded-lg transition-colors',
                                ordersTab === 'participating'
                                    ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            Em que participas
                            {participatingOrders.length > 0 && (
                                <span className="ml-1.5 text-xs opacity-80">({participatingOrders.length})</span>
                            )}
                        </button>
                        {showAllOrders && (
                            <button
                                type="button"
                                onClick={() => setOrdersTab('others')}
                                className={cn(
                                    'flex-1 py-2 px-2 text-sm font-medium rounded-lg transition-colors',
                                    ordersTab === 'others'
                                        ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                )}
                            >
                                Pedidos de outros
                                {otherOrders.length > 0 && (
                                    <span className="ml-1.5 text-xs opacity-80">({otherOrders.length})</span>
                                )}
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => void catchUp()}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors shrink-0"
                        aria-label="Atualizar pedidos"
                    >
                        <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Orders */}
                {orders.length === 0 && otherOrders.length === 0 ? (
                    <div className="text-center py-16 animate-fade-in-up">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40 flex items-center justify-center">
                            <span className="text-4xl">📝</span>
                        </div>
                        <h4 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Ainda sem pedidos</h4>
                        <p className="text-[var(--text-secondary)] mb-4">Toca no + para fazer o primeiro!</p>
                    </div>
                ) : displayedOrders.length === 0 ? (
                    <div className="text-center py-12 animate-fade-in-up">
                        <p className="text-[var(--text-secondary)] text-sm">
                            {ordersTab === 'mine'
                                ? 'Ainda não criaste pedidos nesta viagem.'
                                : ordersTab === 'participating'
                                    ? 'Não estás incluído em pedidos de outros membros.'
                                    : 'Ainda não há pedidos de outros membros.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {displayedOrders.map((order, idx) => {
                            const isCreator = isOrderCreatedByUser(order, currentUserId);
                            const canEdit =
                                isCreator && isOrderEditable(order.can_edit_until);
                            const creatorName = getOrderPlacedByLabel(order, groupMembers);
                            const remaining = getRemainingEditTime(order.can_edit_until);
                            const isWarning = remaining > 0 && remaining < 60;
                            const orderTotal = order.items.reduce((acc, item) => acc + (item.price || 0), 0);

                            const allProcessed = order.items.length > 0 && order.items.every(i => i.found_status !== 'pending');
                            const allMissing = order.items.length > 0 && order.items.every(i => i.found_status === 'not_available');

                            return (
                                <div
                                    key={order.id}
                                    className={cn(
                                        'rounded-[24px] shadow-sm overflow-hidden animate-fade-in-up',
                                        allProcessed ? "p-[3px]" : "border border-[var(--border)]",
                                        allProcessed ? (allMissing ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-500 dark:to-purple-500") : "bg-white dark:bg-slate-800",
                                        canEdit && !allProcessed && "ring-2 ring-amber-400"
                                    )}
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    <div className={cn("bg-white dark:bg-slate-800 overflow-hidden h-full flex flex-col", allProcessed ? "rounded-[21px]" : "")}>
                                        {allProcessed && (
                                            <div className={cn(
                                                "py-1.5 px-4 flex items-center justify-center gap-2 text-xs font-bold text-white uppercase tracking-wider select-none",
                                                allMissing ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-purple-600"
                                            )}>
                                                {allMissing ? <span className="text-sm">💀</span> : <span className="material-icons text-sm">check_circle</span>}
                                                {allMissing ? "Não havia um caralho do que tu querias" : "Pedido concluído"}
                                            </div>
                                        )}
                                        {/* Order Header */}
                                        <div className="p-4 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between bg-gray-50/80 dark:bg-slate-900/50 backdrop-blur-sm relative z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-xl shrink-0 ring-2 ring-white dark:ring-slate-700">
                                                    🛒
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-[var(--text-primary)] text-lg leading-none mb-1">
                                                        Pedido {displayedOrders.length - idx}
                                                    </h3>
                                                    {!isCreator && (
                                                        <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold mb-0.5">
                                                            Pedido por {creatorName}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-[var(--text-muted)] font-medium">
                                                        {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} • {getRelativeTime(order.created)}
                                                    </p>
                                                    <OrderParticipantsRow
                                                        participantIds={order.participants ?? []}
                                                        members={groupMembers}
                                                        currentUserId={currentUserId}
                                                        expandedParticipants={order.expand?.participants}
                                                        onClick={() => openParticipantsSheet(order.id)}
                                                        alwaysClickable
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="text-right">
                                                    <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider mb-0.5">Total</p>
                                                    <p className="text-sm font-black text-[var(--text-primary)]">
                                                        {formatCurrency(orderTotal)}
                                                    </p>
                                                </div>

                                                {canEdit && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={cn(
                                                            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                                                            isWarning ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                                        )}>
                                                            ⏱️ {formatTime(remaining)}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => handleEdit(order)} className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                            </button>
                                                            <button onClick={() => handleDelete(order.id)} className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Items */}
                                        <div className="bg-gray-50 dark:bg-slate-900/30 p-2 gap-2 flex flex-col">
                                            {order.items.map((item) => {
                                                const status = getStatusConfig(item.found_status);
                                                // Override status config to match Admin EXACTLY
                                                const statusConfig = {
                                                    pending: { label: 'Por comprar', bg: 'bg-amber-500 text-white', icon: 'hourglass_empty' },
                                                    found: { label: 'Comprado', bg: 'bg-emerald-500 text-white', icon: 'check' },
                                                    not_available: { label: 'Não tinha', bg: 'bg-red-500 text-white', icon: 'close' },
                                                }[item.found_status] || status;

                                                return (
                                                    <div
                                                        key={item.id}
                                                        className={cn(
                                                            "relative group transition duration-200 rounded-[20px] overflow-hidden border border-gray-100 dark:border-slate-700 shadow-sm",
                                                            item.found_status === 'found' ? "bg-emerald-50/30 dark:bg-emerald-900/10" :
                                                                item.found_status === 'not_available' ? "bg-red-50/30 dark:bg-red-900/10" : "bg-white dark:bg-slate-800"
                                                        )}
                                                    >
                                                        <div className="flex gap-4 items-start p-4">
                                                            {/* Icon Placeholder */}
                                                            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 overflow-hidden border border-gray-100 dark:border-slate-700", item.image_url ? "bg-white" : "bg-[var(--bg-primary)]")}>
                                                                {item.image_url ? (
                                                                    <RemoteImage
                                                                        src={item.image_url}
                                                                        alt={item.name}
                                                                        width={48}
                                                                        height={48}
                                                                        className="w-full h-full object-contain mix-blend-multiply p-1"
                                                                    />
                                                                ) : (
                                                                    <span>{getProductEmoji(item.name)}</span>
                                                                )}
                                                            </div>

                                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                <div className="flex justify-between items-start gap-2 mb-1">
                                                                    <h4 className={cn(
                                                                        "font-bold text-[var(--text-primary)] text-base leading-tight",
                                                                        item.found_status !== 'pending' && "opacity-50"
                                                                    )}>
                                                                        {item.name}
                                                                    </h4>
                                                                    <div className="text-right flex flex-col items-end">
                                                                        <span className="font-bold text-[var(--text-primary)] whitespace-nowrap">
                                                                            {item.price > 0 ? formatCurrency(item.price) : `${formatCurrency(0)}`}
                                                                        </span>
                                                                        {item.price > 0 && item.quantity > 1 && (
                                                                            <span className="text-[10px] text-[var(--text-muted)] font-medium leading-none mt-0.5">
                                                                                p./uni {formatCurrency(item.price / item.quantity)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <ShoppingItemMeta quantity={item.quantity} brand={item.brand} />
                                                            </div>
                                                        </div>

                                                        {/* Wall-to-wall Notes */}
                                                        {item.notes && (
                                                            <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100 text-sm py-2 px-4 border-l-4 border-yellow-400 dark:border-yellow-600 flex items-start gap-2 w-full">
                                                                <span className="font-bold shrink-0">Notas:</span>
                                                                <span className="italic">{item.notes}</span>
                                                            </div>
                                                        )}

                                                        {/* Status Bar (Non-interactive) */}
                                                        <div className={cn(
                                                            "w-full py-1 flex items-center justify-center gap-1.5 text-[13px] font-bold select-none",
                                                            statusConfig.bg
                                                        )}>
                                                            <span className="material-icons text-xs">{statusConfig.icon}</span>
                                                            {statusConfig.label}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* FAB */}
            {
                trip.status === 'open' && (
                    <button
                        onClick={openNewOrder}
                        className={cn(
                            'fab !bg-none !bg-blue-600 hover:!bg-blue-700 text-white !shadow-[0_8px_30px_-5px_rgba(37,99,235,0.6)] fixed right-6 !z-[56] transition duration-300',
                            !online && 'opacity-50'
                        )}
                        style={{ bottom: getFabBottom(isAdmin, hasMinimizedDock) }}
                        aria-label="Novo pedido"
                    >
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                )
            }

            {/* Bottom Sheet */}

            {/* Order Sheet */}
            {/* Order Sheet */}
            <OrderFormSheet
                isOpen={isSheetActive(orderSheetSession)}
                onClose={() => setOrderSheetSession('closed')}
                onSubmit={handleOrderSubmit}
                initialItems={initialFormItems}
                title={editingOrderId ? 'Editar Pedido' : 'Novo Pedido'}
                submitLabel={editingOrderId ? 'Atualizar Pedido' : 'Fazer Pedido'}
                submitting={submitting}
                flow={editingOrderId ? 'edit' : 'create'}
                groupMembers={groupMembers}
                currentUserId={currentUserId}
                initialParticipantIds={initialParticipantIds}
                minimized={orderSheetSession === 'minimized'}
                onMinimize={() => setOrderSheetSession('minimized')}
                onExpand={() => setOrderSheetSession('expanded')}
                onDiscard={() => setOrderSheetSession('closed')}
                minimizedAboveBottomNav={isAdmin}
                onDraftActiveChange={setOrderSheetDraftActive}
            />

            <OrderParticipantsSheet
                isOpen={isSheetActive(participantsSheetSession)}
                onClose={() => {
                    setParticipantsSheetOrderId(null);
                    setParticipantsSheetSession('closed');
                }}
                title={participantsSheetEditable ? 'Quem participa?' : 'Participantes'}
                groupMembers={groupMembers}
                participantIds={participantsSheetOrder?.participants ?? []}
                readOnly={!participantsSheetEditable}
                onSave={participantsSheetEditable ? handleSaveParticipants : undefined}
                submitting={submitting}
                minimized={participantsSheetSession === 'minimized'}
                onMinimize={() => setParticipantsSheetSession('minimized')}
                onExpand={() => setParticipantsSheetSession('expanded')}
                onDiscard={() => {
                    setParticipantsSheetOrderId(null);
                    setParticipantsSheetSession('closed');
                }}
                minimizedAboveBottomNav={isAdmin}
                onDraftActiveChange={setParticipantsSheetDraftActive}
            />
        </div >
    );
}
