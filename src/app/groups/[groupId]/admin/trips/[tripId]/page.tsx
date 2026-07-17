'use client';

import { useState, useEffect, useCallback, useRef, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { tripsApi, ordersApi, itemsApi, groupsApi, subscriptions } from '@/lib/pocketbase';
import { useUser } from '@/context/UserContext';
import type { Trip, Item, Order, User } from '@/lib/types';
import { getInitials, formatCurrency, cn, getRelativeTime } from '@/lib/utils';
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
    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);
    const [orderCards, setOrderCards] = useState<AdminOrderCard[]>([]);
    const { user, updateProfile } = useUser();

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

    // New Order Form
    const [members, setMembers] = useState<User[]>([]);

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

    // Race condition protection
    const activeTripId = useRef(tripId);
    useEffect(() => { activeTripId.current = tripId; }, [tripId]);

    const loadShoppingItems = useCallback(async () => {
        try {
            const ordersData = await ordersApi.getByTrip(tripId);
            if (activeTripId.current !== tripId) return;

            const allItems = await itemsApi.getByOrderIds(ordersData.map((order) => order.id));
            const itemsByOrder = new Map<string, Item[]>();
            for (const item of allItems) {
                const list = itemsByOrder.get(item.order_id) ?? [];
                list.push(item);
                itemsByOrder.set(item.order_id, list);
            }

            if (activeTripId.current !== tripId) return;

            const cards = ordersData.map((order) =>
                buildAdminOrderCard(order, itemsByOrder.get(order.id) ?? [], members)
            );
            setOrderCards(cards);
        } catch (error) {
            if (activeTripId.current === tripId) {
                console.error(error);
                showToast('Falha ao carregar itens', 'error');
            }
        }
    }, [tripId, showToast, members]);

    const loadTrip = useCallback(async () => {
        try {
            const data = await tripsApi.getById(tripId);
            if (activeTripId.current !== tripId) return;
            setTrip(data);
        } catch {
            if (activeTripId.current !== tripId) return;
            showToast('Falha ao carregar detalhes da viagem', 'error');
            router.push('/admin');
        } finally {
            if (activeTripId.current === tripId) setLoading(false);
        }
    }, [tripId, showToast, router]);

    useEffect(() => {
        setLoading(true);
        loadTrip();
        loadShoppingItems();

        const unsubTrips = subscriptions.subscribeToTrips(() => {
            if (activeTripId.current === tripId) loadTrip();
        });
        const unsubItems = subscriptions.subscribeToItems(() => {
            if (activeTripId.current === tripId) loadShoppingItems();
        });

        return () => {
            subscriptions.unsubscribeAll();
        };
    }, [loadTrip, loadShoppingItems, tripId]);

    // Load members separately when group_id is available
    useEffect(() => {
        if (trip?.group_id) {
            groupsApi.getById(trip.group_id).then(g => {
                const list = [];
                if (g.expand?.creator) list.push(g.expand.creator);
                if (g.expand?.admins) list.push(...g.expand.admins);
                if (g.expand?.members) list.push(...g.expand.members);
                // Dedup
                const unique = Array.from(new Map(list.map(m => [m.id, m])).values());
                setMembers(unique);
            }).catch(console.error);
        }
    }, [trip?.group_id]);

    const cycleStatus = async (item: ShoppingItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const statuses: Item['found_status'][] = ['pending', 'found', 'not_available'];
        const currentIdx = statuses.indexOf(item.found_status);
        const nextStatus = statuses[(currentIdx + 1) % 3];

        // Optimistic UI update
        setOrderCards(prev =>
            prev.map(order => ({
                ...order,
                items: order.items.map(i =>
                    i.id === item.id ? { ...i, found_status: nextStatus } : i
                ),
            }))
        );

        try {
            await itemsApi.updateStatus(item.id, nextStatus);
            // No reload needed if successful, state is already correct
        } catch {
            showToast('Falha ao atualizar estado do produto', 'error');
            // Revert on failure
            setOrderCards(prev =>
                prev.map(order => ({
                    ...order,
                    items: order.items.map(i =>
                        i.id === item.id ? { ...i, found_status: item.found_status } : i
                    ),
                }))
            );
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
        showToast('Produto movido para outro pedido', 'success');
        loadShoppingItems();
    };

    const handleUpdateItem = async (data: { items: ItemFormData[] }) => {
        if (!selectedItem) return;
        setSubmitting(true);
        const itemData = data.items[0];
        const qty = Number(itemData.quantity) || 1;
        const uPrice = Number(itemData.unit_price) || 0;

        try {
            await itemsApi.update(selectedItem.id, {
                name: itemData.name,
                quantity: qty,
                unit_price: uPrice,
                price: uPrice * qty,
                found_status: itemData.found_status,
                brand: itemData.brand,
                notes: itemData.notes
            });
            showToast('Produto atualizado!', 'success');
            setShowEditItemModal(false);
            loadShoppingItems();
        } catch {
            showToast('Falha ao atualizar produto', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteItem = async () => {
        if (!selectedItem || !confirm('Tem a certeza de que quer eliminar este produto?')) return;
        setSubmitting(true);
        try {
            const { orderDeleted } = await itemsApi.deleteAndPruneEmptyOrder(
                selectedItem.id,
                selectedItem.order_id
            );
            showToast(
                orderDeleted ? 'Produto removido e pedido vazio eliminado' : 'Produto eliminado!',
                'success'
            );
            setShowEditItemModal(false);
            setSelectedItem(null);
            loadShoppingItems();
        } catch {
            showToast('Falha ao eliminar produto', 'error');
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
            await ordersApi.update(participantsSheetOrder.orderId, updatePayload);
            showToast('Pedido atualizado', 'success');
            setParticipantsSheetOrderId(null);
            setParticipantsSheetSession('closed');
            loadShoppingItems();
        } catch (error) {
            console.error('Error:', error);
            showToast('Erro ao guardar participantes', 'error');
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
            const createPayload = buildOrderCreatePayload({
                tripId,
                participantIds,
                members,
                audienceType,
                createdByUserId: user?.id || participantIds[0] || '',
            });
            const order = await ordersApi.create(createPayload);

            for (const item of data.items) {
                if (item.name.trim()) {
                    await itemsApi.create({
                        order_id: order.id,
                        name: item.name.trim(),
                        quantity: item.quantity,
                        price: (item.unit_price || 0) * item.quantity,
                        // @ts-ignore
                        unit_price: item.unit_price,
                        brand: item.brand,
                        notes: item.notes,
                        image_url: item.image_url
                    });
                }
            }

            showToast('Pedido adicionado!', 'success');
            setNewOrderSession('closed');
            loadShoppingItems();
        } catch {
            showToast('Falha ao criar pedido', 'error');
        } finally {
            setSubmitting(false);
        }
    };



    const getStatusFilterConfig = (status: typeof statusFilter) => {
        switch (status) {
            case 'all': return { label: 'Todos', color: 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300' };
            case 'pending': return { label: 'Por comprar', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50' };
            case 'found': return { label: 'Comprados', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50' };
            case 'not_available': return { label: 'Não tinha', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50' };
        }
    };

    const cycleStatusFilter = () => {
        const order: typeof statusFilter[] = ['all', 'pending', 'found', 'not_available'];
        const nextIndex = (order.indexOf(statusFilter) + 1) % order.length;
        setStatusFilter(order[nextIndex]);
    };

    const getPriceFilterConfig = (status: typeof priceFilter) => {
        switch (status) {
            case 'all': return { label: 'Todos', color: 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300' };
            case 'with_price': return { label: 'Com Preço', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50' };
            case 'no_price': return { label: 'Sem Preço', color: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-600' };
        }
    };

    const cyclePriceFilter = () => {
        const order: typeof priceFilter[] = ['all', 'with_price', 'no_price'];
        const nextIndex = (order.indexOf(priceFilter) + 1) % order.length;
        setPriceFilter(order[nextIndex]);
    };
    // Helper for Segmented Control
    const SegmentedControl = ({
        options,
        value,
        onChange,
        className = ""
    }: {
        options: { value: string; label: string; icon?: string; color?: string }[],
        value: string,
        onChange: (val: any) => void,
        className?: string
    }) => (
        <div className={cn("flex bg-gray-100 p-1 rounded-lg w-full", className)}>
            {options.map((opt) => {
                const isActive = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-sm font-bold rounded-md transition-all",
                            isActive
                                ? "bg-white dark:bg-slate-700 text-[var(--text-primary)] shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-slate-600/50",
                            isActive && opt.color // Apply specific color if active and defined
                        )}
                        style={isActive && opt.color ? { color: opt.color, backgroundColor: 'var(--bg-secondary)' } : {}}
                    >
                        {opt.icon && <span className="material-icons text-base">{opt.icon}</span>}
                        {opt.label}
                    </button>
                )
            })}
        </div>
    );

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
            await tripsApi.update(tripId, { status: 'closed' });
            showToast('Viagem terminada! Podes agora criar a divisão de contas.', 'success');
            loadTrip();

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

        } catch {
            showToast('Erro ao atualizar viagem', 'error');
        }
    };

    const handleLockTrip = async () => {
        if (!confirm('Tens a certeza que queres fechar a trip para novos pedidos?')) return;
        if (!trip) return;

        try {
            await tripsApi.update(tripId, { status: 'in_progress' });
            showToast('Viagem em progresso! Hora das compras 🛍️', 'success');
            loadTrip();

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

        } catch {
            showToast('Erro ao atualizar viagem', 'error');
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
        <div className="min-h-screen bg-[var(--bg-primary)] has-bottom-nav">
            {stickyCardProps && (
                <StickyActionCard
                    visible={true}
                    title={stickyCardProps.title}
                    actionLabel={stickyCardProps.actionLabel}
                    onAction={stickyCardProps.onAction}
                    stackAboveMinimized={hasMinimizedDock}
                />
            )}
            <Header title="Admin Panel" subtitle={trip.name} showBack />

            <main className="container mx-auto px-4 py-8 max-w-2xl">
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <div className="card p-3 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1">Total Produtos</p>
                        <p className="text-xl font-black text-[var(--text-primary)]">{stats.total}</p>
                    </div>

                    <div className="card p-3 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1">Por comprar</p>
                        <p className="text-xl font-black text-amber-500">{stats.pending}</p>
                    </div>

                    <div className="card p-3 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold mb-1">Gasto Atual</p>
                        <p className="text-xl font-black text-emerald-600">{formatCurrency(boughtCost)}</p>
                    </div>
                </div>

                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Pedidos</h2>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setCompactView(v => !v)}
                            variant="secondary"
                            className={cn(
                                "!h-10 !w-10 !p-0 rounded-full flex items-center justify-center shadow-sm transition-colors",
                                compactView
                                    ? "bg-violet-600 text-white hover:bg-violet-700"
                                    : "bg-white dark:bg-slate-800 border border-[var(--border)] text-[var(--text-muted)] hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-200 dark:hover:border-violet-700"
                            )}
                            title={compactView ? "Ver detalhado" : "Ver resumo"}
                        >
                            <span className="material-icons text-xl">{compactView ? 'view_agenda' : 'checklist'}</span>
                        </Button>
                        <Button
                            onClick={() => setShowScanSheet(true)}
                            variant="secondary"
                            className="!h-10 !w-10 !p-0 rounded-full flex items-center justify-center bg-violet-600 text-white hover:bg-violet-700 shadow-sm transition-colors"
                            title="Scan da fatura (Gemini)"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11H15M9 7H13M9 15H15M5 6.2V21L7.5 19L10 21L12 19L14 21L16.5 19L19 21V6.2C19 5.0799 19 4.51984 18.782 4.09202C18.5903 3.71569 18.2843 3.40973 17.908 3.21799C17.4802 3 16.9201 3 15.8 3H8.2C7.0799 3 6.51984 3 6.09202 3.21799C5.71569 3.40973 5.40973 3.71569 5.21799 4.09202C5 4.51984 5 5.0799 5 6.2Z" />
                            </svg>
                        </Button>
                        <Button
                            onClick={openNewOrder}
                            className="btn-primary h-10 px-4 text-sm"
                        >
                            + Novo Pedido
                        </Button>
                    </div>
                </div>

                {/* Filters & Sort */}
                <div className="mb-6 flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                    {/* Sort Pill */}
                    <button
                        onClick={() => setSortOrder(current => current === 'desc' ? 'asc' : 'desc')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 active:scale-95"
                    >
                        <span className="material-icons text-sm">schedule</span>
                        {sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos'}
                    </button>

                    {/* Status Cycle Button */}
                    <button
                        onClick={cycleStatusFilter}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap active:scale-95",
                            getStatusFilterConfig(statusFilter).color
                        )}
                    >
                        <span className="material-icons text-sm">filter_list</span>
                        {getStatusFilterConfig(statusFilter).label}
                    </button>

                    {/* Price Cycle Button */}
                    <button
                        onClick={cyclePriceFilter}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap active:scale-95",
                            getPriceFilterConfig(priceFilter).color
                        )}
                    >
                        <span className="material-icons text-sm">attach_money</span>
                        {getPriceFilterConfig(priceFilter).label}
                    </button>
                </div>

                {/* Shopping List — one card per order */}
                <div className="space-y-6">
                    {orderCards.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center">
                            <div className="w-20 h-20 mb-4 rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-3xl">
                                🛒
                            </div>
                            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Lista Vazia</h3>
                            <p className="text-[var(--text-secondary)] text-sm mb-6">Nenhum produto pedido para esta viagem.</p>
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
                                        "rounded-[24px] shadow-sm overflow-hidden",
                                        allProcessed ? "p-[3px]" : "border border-[var(--border)]",
                                        allProcessed ? (allMissing ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-purple-600 dark:from-violet-500 dark:to-purple-500") : "bg-white dark:bg-slate-800"
                                    )}>
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
                                            {/* Order header */}
                                            {compactView ? (
                                                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-2 bg-gray-50/80 dark:bg-slate-900/50 backdrop-blur-sm relative z-10">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Avatar
                                                            name={orderCard.creatorName}
                                                            src={orderCard.creatorAvatar}
                                                            size="sm"
                                                        />
                                                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                                                            Por {orderCard.creatorName}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-black text-[var(--text-primary)] shrink-0">
                                                        {formatCurrency(filteredItems.reduce((acc, item) => acc + (item.price || 0), 0))}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-gray-50/80 dark:bg-slate-900/50 backdrop-blur-sm relative z-10">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Avatar
                                                            name={orderCard.creatorName}
                                                            src={orderCard.creatorAvatar}
                                                            size="md"
                                                        />
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-[var(--text-primary)] text-lg leading-none mb-1">
                                                                Pedido {orderNumber}
                                                            </h3>
                                                            <p className="text-xs text-[var(--text-muted)] font-medium">
                                                                Por {orderCard.creatorName} • {filteredItems.length}{' '}
                                                                {filteredItems.length === 1 ? 'item' : 'itens'}
                                                                {statusFilter !== 'all' && ' visíveis'} •{' '}
                                                                {getRelativeTime(orderCard.orderCreated)}
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
                                                        <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider mb-0.5">Total</p>
                                                        <p className="text-sm font-black text-[var(--text-primary)]">
                                                            {formatCurrency(filteredItems.reduce((acc, item) => acc + (item.price || 0), 0))}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Items List */}
                                            <div className="bg-gray-50 dark:bg-slate-900/30 p-2 gap-2 flex flex-col">
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
                onApplied={loadShoppingItems}
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

