'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useEditTimer } from '@/hooks/useEditTimer';
import { tripsApi, ordersApi, itemsApi, subscriptions } from '@/lib/pocketbase';
import type { Trip, Item, OrderWithItems } from '@/lib/types';
import { getRelativeTime, formatCurrency, isOrderEditable, getRemainingEditTime, formatTime, cn, getProductEmoji } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';

interface ItemFormData {
    name: string;
    quantity: number;
    unit_price: number;
    brand: 'Official' | 'Off-brand' | '';
    notes: string;
    image_url: string;
}

interface SearchProduct {
    id: string;
    name: string;
    marca: string;
    capacity?: string;
    imageURL: string;
    pricePerUnitContinente?: string;
    pricePerUnitPingoDoce?: string;
    pricePerUnitAuchan?: string;
    priceCampaignContinente?: string;
    priceCampaignPingoDoce?: string;
    priceCampaignAuchan?: string;
}

export function MemberView({ tripId }: { tripId: string }) {
    const router = useRouter();
    const { user, isLoggedIn } = useUser();
    const { showToast } = useToast();
    const { startTimer } = useEditTimer();

    const userName = user?.name || user?.email || 'Anónimo';

    const [trip, setTrip] = useState<Trip | null>(null);
    const [orders, setOrders] = useState<OrderWithItems[]>([]);
    const [loading, setLoading] = useState(true);
    const [showOrderSheet, setShowOrderSheet] = useState(false);
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const [orderItems, setOrderItems] = useState<ItemFormData[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [currentTime, setCurrentTime] = useState(Date.now());

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // Timer updates
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Load Data
    const loadData = useCallback(async () => {
        try {
            const [tripData, ordersData] = await Promise.all([
                tripsApi.getById(tripId),
                ordersApi.getByTrip(tripId),
            ]);

            setTrip(tripData);
            const userOrders = ordersData.filter(order => order.user_name === userName);
            const ordersWithItems = await Promise.all(
                userOrders.map(async (order) => {
                    const items = await itemsApi.getByOrder(order.id);
                    return { ...order, items };
                })
            );
            setOrders(ordersWithItems);
        } catch (error) {
            console.error('Error loading trip:', error);
            showToast('Erro ao carregar viagem', 'error');
        } finally {
            setLoading(false);
        }
    }, [tripId, userName, showToast]);

    useEffect(() => {
        loadData();
        subscriptions.subscribeToOrders(tripId, () => loadData());
        subscriptions.subscribeToItems(() => loadData());
        return () => subscriptions.unsubscribeAll();
    }, [tripId, loadData]);

    // Stats
    const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);
    const estimatedCost = orders.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => {
            const cost = (item.unit_price || 0) * (item.quantity || 1) || item.price || 0;
            return itemSum + cost;
        }, 0), 0
    );

    // Search
    const searchProducts = async (term?: string) => {
        const queryToUse = typeof term === 'string' ? term : searchQuery;
        if (!queryToUse.trim()) return;
        setSearchLoading(true);
        try {
            const response = await fetch(`https://supersave.pt/web/api/newLastStateCall.php?search=${encodeURIComponent(queryToUse)}`);
            const data = await response.json();
            setSearchResults(data.products?.slice(0, 8) || []);
        } catch {
            showToast('Erro ao pesquisar', 'error');
        } finally {
            setSearchLoading(false);
        }
    };

    const getBestPrice = (product: SearchProduct) => {
        const prices: { price: number; store: string }[] = [];
        if (product.priceCampaignContinente) prices.push({ price: parseFloat(product.priceCampaignContinente), store: 'Continente' });
        if (product.priceCampaignPingoDoce) prices.push({ price: parseFloat(product.priceCampaignPingoDoce), store: 'Pingo Doce' });
        if (product.priceCampaignAuchan) prices.push({ price: parseFloat(product.priceCampaignAuchan), store: 'Auchan' });
        if (prices.length === 0) {
            if (product.pricePerUnitContinente) prices.push({ price: parseFloat(product.pricePerUnitContinente), store: 'Continente' });
            if (product.pricePerUnitPingoDoce) prices.push({ price: parseFloat(product.pricePerUnitPingoDoce), store: 'Pingo Doce' });
            if (product.pricePerUnitAuchan) prices.push({ price: parseFloat(product.pricePerUnitAuchan), store: 'Auchan' });
        }
        if (prices.length === 0) return { price: 0, store: '' };
        return prices.reduce((min, curr) => curr.price < min.price ? curr : min);
    };

    const addFromSearch = (product: SearchProduct) => {
        const p = getBestPrice(product);
        setOrderItems([...orderItems, {
            name: product.name,
            quantity: 1,
            unit_price: p.price,
            brand: '',
            notes: product.marca,
            image_url: product.imageURL || '',
        }]);
        showToast(`"${product.name}" adicionado`, 'success');
    };

    // Form handlers
    const addEmptyItem = () => {
        setOrderItems([...orderItems, { name: '', quantity: 1, unit_price: 0, brand: 'Official', notes: '', image_url: '' }]);
    };

    const removeItem = (index: number) => {
        if (orderItems.length > 1) setOrderItems(orderItems.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof ItemFormData, value: string | number) => {
        const updated = [...orderItems];
        updated[index] = { ...updated[index], [field]: value };
        setOrderItems(updated);
    };

    const resetForm = () => {
        setOrderItems([{ name: '', quantity: 1, unit_price: 0, brand: 'Official', notes: '', image_url: '' }]);
        setEditingOrderId(null);
        setSearchQuery('');
        setSearchResults([]);
    };

    const openNewOrder = () => {
        resetForm();
        setShowOrderSheet(true);
        searchProducts("Super Bock");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validItems = orderItems.filter(i => i.name.trim());
        if (validItems.length === 0) {
            showToast('Adiciona pelo menos um produto', 'error');
            return;
        }

        setSubmitting(true);
        try {
            if (editingOrderId) {
                const existing = orders.find(o => o.id === editingOrderId);
                if (existing) {
                    for (const item of existing.items) await itemsApi.delete(item.id);
                }
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
            } else {
                const order = await ordersApi.create({ trip_id: tripId, user_name: userName });
                startTimer(order.id, order.can_edit_until);
                for (const item of validItems) {
                    await itemsApi.create({
                        order_id: order.id,
                        name: item.name,
                        quantity: item.quantity,
                        brand: item.brand,
                        notes: item.notes,
                        price: item.quantity * item.unit_price,
                        image_url: item.image_url,
                    });
                }
                showToast('Pedido criado!', 'success');
            }
            setShowOrderSheet(false);
            resetForm();
            loadData();
        } catch (error) {
            console.error('Error:', error);
            showToast('Erro ao guardar pedido', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (order: OrderWithItems) => {
        if (!isOrderEditable(order.can_edit_until)) {
            showToast('Limite de 5 minutos excedido', 'error');
            return;
        }
        setEditingOrderId(order.id);
        setOrderItems(order.items.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price || i.price / i.quantity || 0,
            brand: (i.brand as 'Official' | 'Off-brand' | '') || 'Official',
            notes: i.notes || '',
            image_url: i.image_url || '',
        })));
        setShowOrderSheet(true);
    };

    const handleDelete = async (orderId: string) => {
        const order = orders.find(o => o.id === orderId);
        if (!order || !isOrderEditable(order.can_edit_until)) {
            showToast('Limite de 5 minutos excedido', 'error');
            return;
        }
        if (!confirm('Eliminar este pedido?')) return;

        const previousOrders = [...orders];
        setOrders(current => current.filter(o => o.id !== orderId));

        try {
            for (const item of order.items) await itemsApi.delete(item.id);
            await ordersApi.delete(orderId);
            showToast('Pedido eliminado', 'success');
        } catch {
            showToast('Erro ao eliminar', 'error');
            setOrders(previousOrders);
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
            <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        );
    }

    if (!trip) {
        return (
            <div className="text-center py-20">
                <div className="text-6xl mb-4">😕</div>
                <h2 className="text-xl font-bold mb-4">Viagem não encontrada</h2>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            {/* Stats */}
            {totalItems > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in-up">
                    <div className="card p-4 text-center">
                        <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-violet-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Produtos</p>
                        <p className="text-xl font-bold text-[var(--text-primary)]">{totalItems}</p>
                    </div>
                    <div className="card p-4 text-center">
                        <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-amber-100 flex items-center justify-center">
                            <span className="text-amber-600">€</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Estimado</p>
                        <p className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(estimatedCost)}</p>
                    </div>
                </div>
            )}

            {/* Section Header */}
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Os Teus Pedidos</h3>
                <button onClick={loadData} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
                    <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* Orders */}
            {orders.length === 0 ? (
                <div className="text-center py-16 animate-fade-in-up">
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
                        <span className="text-4xl">📝</span>
                    </div>
                    <h4 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Ainda sem pedidos</h4>
                    <p className="text-[var(--text-secondary)] mb-4">Toca no + para fazer o primeiro!</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {orders.map((order, idx) => {
                        const canEdit = isOrderEditable(order.can_edit_until);
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
                                    allProcessed ? (allMissing ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-purple-600") : "bg-white",
                                    canEdit && !allProcessed && "ring-2 ring-amber-400"
                                )}
                                style={{ animationDelay: `${idx * 0.05}s` }}
                            >
                                <div className={cn("bg-white overflow-hidden h-full flex flex-col", allProcessed ? "rounded-[21px]" : "")}>
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
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80 backdrop-blur-sm relative z-10">
                                        <div className="flex items-center gap-3">
                                            <Avatar
                                                name={order.expand?.user?.name || order.user_name || '??'}
                                                src={order.expand?.user?.avatar ? `https://pb-orderit.povoas.top/api/files/users/${order.expand.user.id}/${order.expand.user.avatar}` : undefined}
                                                size="md"
                                                className="ring-2 ring-white"
                                            />
                                            <div>
                                                <h3 className="font-bold text-[var(--text-primary)] text-lg leading-none mb-1">
                                                    {order.expand?.user?.name || order.user_name || `Pedido ${idx + 1}`}
                                                </h3>
                                                <p className="text-xs text-[var(--text-muted)] font-medium">
                                                    {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} • {getRelativeTime(order.created)}
                                                </p>
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
                                                        isWarning ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-amber-100 text-amber-600'
                                                    )}>
                                                        ⏱️ {formatTime(remaining)}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => handleEdit(order)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button onClick={() => handleDelete(order.id)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div className="bg-gray-50 p-2 gap-2 flex flex-col">
                                        {order.items.map((item) => {
                                            const status = getStatusConfig(item.found_status);
                                            // Override status config to match Admin EXACTLY
                                            const statusConfig = {
                                                pending: { label: 'Por comprar', bg: 'bg-amber-500', icon: 'hourglass_empty' },
                                                found: { label: 'Comprado', bg: 'bg-emerald-500', icon: 'check' },
                                                not_available: { label: 'Não tinha', bg: 'bg-red-500', icon: 'close' },
                                            }[item.found_status] || status;

                                            return (
                                                <div
                                                    key={item.id}
                                                    className={cn(
                                                        "relative group transition-all duration-200 rounded-[20px] overflow-hidden border border-gray-100 shadow-sm",
                                                        item.found_status === 'found' ? "bg-emerald-50/30" :
                                                            item.found_status === 'not_available' ? "bg-red-50/30" : "bg-white"
                                                    )}
                                                >
                                                    <div className="flex gap-4 items-start p-4">
                                                        {/* Icon Placeholder */}
                                                        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-primary)] flex items-center justify-center text-2xl shrink-0 overflow-hidden border border-gray-100">
                                                            {item.image_url ? (
                                                                <img src={item.image_url} alt={item.name} className="w-full h-full object-contain mix-blend-multiply p-1" />
                                                            ) : (
                                                                <span>{getProductEmoji(item.name)}</span>
                                                            )}
                                                        </div>

                                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                                <h4 className={cn(
                                                                    "font-bold text-[var(--text-primary)] text-base leading-tight",
                                                                    item.found_status !== 'pending' && "opacity-50 line-through"
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

                                                            <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="material-icons text-sm text-slate-500">shopping_basket</span>
                                                                    <span>{item.quantity}</span>
                                                                </div>

                                                                {item.brand && (
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="material-icons text-sm text-slate-500">local_offer</span>
                                                                        <span>
                                                                            {item.brand.toLowerCase().includes('official') ? 'Original' :
                                                                                (item.brand.toLowerCase().includes('white') || item.brand.toLowerCase().includes('brand') || item.brand === 'Branca') ? 'Branca' :
                                                                                    item.brand}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Wall-to-wall Notes */}
                                                    {item.notes && (
                                                        <div className="bg-yellow-50 text-yellow-900 text-sm py-2 px-4 border-l-4 border-yellow-400 flex items-start gap-2 w-full">
                                                            <span className="font-bold shrink-0">Notas:</span>
                                                            <span className="italic">{item.notes}</span>
                                                        </div>
                                                    )}

                                                    {/* Status Bar (Non-interactive) */}
                                                    <div className={cn(
                                                        "w-full py-1 flex items-center justify-center gap-1.5 text-[13px] font-bold text-white select-none",
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

            {/* FAB */}
            {
                trip.status === 'open' && (
                    <button onClick={openNewOrder} className="fab" aria-label="Novo pedido">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                )
            }

            {/* Bottom Sheet */}
            {
                showOrderSheet && (
                    <>
                        <div className="fixed inset-0 bg-black/50 z-40 animate-fade-in" onClick={() => setShowOrderSheet(false)} />
                        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up" style={{ maxHeight: '90vh', paddingBottom: 'calc(80px + var(--safe-bottom))' }}>
                            {/* Handle */}
                            <div className="sticky top-0 bg-white rounded-t-3xl z-10 pt-3 pb-2 px-5 border-b border-[var(--border)]">
                                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-3" />
                                <div className="flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                                        {editingOrderId ? 'Editar Pedido' : 'Novo Pedido'}
                                    </h2>
                                    <button onClick={() => setShowOrderSheet(false)} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg">
                                        <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable content */}
                            <div className="overflow-y-auto px-5 py-4 pb-32" style={{ maxHeight: 'calc(90vh - 180px)' }}>
                                {/* Items */}
                                {orderItems.map((item, i) => (
                                    <div key={i} className="mb-4 p-4 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)]">
                                        {/* Row 1: Name + Quantity */}
                                        <div className="grid grid-cols-3 gap-3 mb-3">
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Nome do Produto</label>
                                                <input type="text" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="ex. Bananas" className="input w-full" required />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Quantidade</label>
                                                <input type="number" min={1} value={item.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} className="input w-full text-center" />
                                            </div>
                                        </div>

                                        {/* Row 2: Price + Total */}
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Preço p/Uni. (€)</label>
                                                <input type="number" min={0} step={0.01} value={item.unit_price || ''} onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)} placeholder="0.00" className="input w-full" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Preço Total</label>
                                                <input type="text" value={formatCurrency(item.quantity * item.unit_price)} disabled className="input w-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]" />
                                            </div>
                                        </div>

                                        {/* Row 3: Brand */}
                                        <div className="mb-3">
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Marca (opcional)</label>
                                            <div className="flex items-center gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name={`brand-${i}`} checked={item.brand === 'Official' || !item.brand} onChange={() => updateItem(i, 'brand', 'Official')} className="w-4 h-4 text-violet-600" />
                                                    <span className="text-sm text-[var(--text-primary)]">Original</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name={`brand-${i}`} checked={item.brand === 'Off-brand'} onChange={() => updateItem(i, 'brand', 'Off-brand')} className="w-4 h-4 text-violet-600" />
                                                    <span className="text-sm text-[var(--text-primary)]">Branca</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Row 4: Notes */}
                                        <div className="mb-3">
                                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Notas (opcional)</label>
                                            <textarea value={item.notes} onChange={e => updateItem(i, 'notes', e.target.value)} placeholder="Qualquer requisito específico..." rows={2} className="input w-full resize-none" />
                                        </div>

                                        {/* Remove button */}
                                        {orderItems.length > 1 && (
                                            <button type="button" onClick={() => removeItem(i)} className="text-red-500 text-sm font-medium flex items-center gap-1 hover:underline">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                                Remover Produto
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {/* Add Item Button */}
                                <button type="button" onClick={addEmptyItem} className="w-full py-3 border-2 border-dashed border-[var(--border)] rounded-xl text-violet-600 font-medium hover:bg-violet-50 transition-colors mb-6 flex items-center justify-center gap-2">
                                    <span className="text-lg">⊕</span> Adicionar Outro Produto
                                </button>

                                {/* Search Section */}
                                <div className="mb-8">
                                    <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2 px-1">
                                        <span>🔍</span> Pesquisar Produtos
                                    </h3>

                                    {/* Modern Search Bar */}
                                    <div className="relative mb-6 group">
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchProducts())}
                                            placeholder="Pesquisar produto (ex: Super Bock)..."
                                            className="input w-full pl-5 pr-14 py-4 rounded-2xl text-base shadow-sm border-gray-200 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all bg-gray-50/50 focus:bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => searchProducts()}
                                            disabled={searchLoading}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-white text-violet-600 rounded-xl hover:bg-violet-50 disabled:opacity-50 transition-all shadow-sm border border-gray-100"
                                        >
                                            {searchLoading ? <LoadingSpinner size="sm" /> : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>

                                    {/* Results List */}
                                    {searchResults.length > 0 && (
                                        <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 safe-scroll">
                                            {searchResults.map(p => {
                                                const price = getBestPrice(p);
                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => addFromSearch(p)}
                                                        className="w-full p-4 bg-white rounded-2xl flex items-center gap-4 hover:bg-gray-50 active:scale-[0.99] transition-all text-left border border-gray-100 shadow-sm group"
                                                    >
                                                        {/* Bigger Image Container */}
                                                        <div className="w-16 h-16 shrink-0 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center">
                                                            {p.imageURL ? (
                                                                <img src={p.imageURL} alt={p.name} className="w-full h-full object-contain mix-blend-multiply" />
                                                            ) : (
                                                                <span className="text-2xl opacity-30">🛒</span>
                                                            )}
                                                        </div>

                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0 py-1">
                                                            <p className="font-bold text-[var(--text-primary)] text-base leading-tight mb-1 line-clamp-2">{p.name}</p>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="text-xs font-medium text-[var(--text-muted)] bg-gray-100 px-2 py-0.5 rounded-md">{p.marca}</span>
                                                                {price.price > 0 && (
                                                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                                        €{price.price.toFixed(2)}
                                                                        <span className="font-normal opacity-70">• {price.store}</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Add Action Button */}
                                                        <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors shadow-sm shrink-0">
                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                            </svg>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Fixed submit button - above bottom nav */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-[var(--border)]" style={{ marginBottom: 'calc(var(--bottom-nav-height, 72px) + var(--safe-bottom, 0px))' }}>
                                <button type="button" disabled={submitting} onClick={handleSubmit} className="w-full btn btn-primary py-4 text-lg font-semibold">
                                    {submitting ? 'A guardar...' : editingOrderId ? 'Atualizar Pedido' : 'Fazer Pedido'}
                                </button>
                            </div>
                        </div>
                    </>
                )
            }
        </div >
    );
}
