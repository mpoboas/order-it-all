'use client';

import { useEffect, useState, useCallback, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { tripsApi, ordersApi, itemsApi, subscriptions } from '@/lib/pocketbase';
import { summarizeTrip } from '@/app/actions/ai';
import { useUser } from '@/context/UserContext';
import type { Trip, Item } from '@/lib/types';
import { formatCurrency, cn, getRelativeTime, getProductEmoji } from '@/lib/utils';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

interface ShoppingItem extends Item {
    user_name: string;
    order_id: string;
    order_created: string;
}

interface UserGroup {
    userId: string;
    userName: string;
    userAvatar?: string;
    orderCreated: string; // approximate (from the first item or order record)
    items: ShoppingItem[];
}

export default function AdminTripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
    const { tripId } = use(params);
    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);
    const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
    const { user } = useUser();

    // AI
    const [showAiSheet, setShowAiSheet] = useState(false);
    const [aiSummary, setAiSummary] = useState<any>(null);
    const [aiLoading, setAiLoading] = useState(false);

    // Modals
    const [showEditItemModal, setShowEditItemModal] = useState(false);
    const [showNewOrderModal, setShowNewOrderModal] = useState(false);

    // Edit Item Form
    const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null);
    const [itemName, setItemName] = useState('');
    const [itemQuantity, setItemQuantity] = useState<number | string>(1);
    const [itemUnitPrice, setItemUnitPrice] = useState<number | string>(0);
    const [itemStatus, setItemStatus] = useState<Item['found_status']>('pending');
    const [itemBrand, setItemBrand] = useState('Official'); // Default to Official
    const [itemNotes, setItemNotes] = useState('');

    // New Order Form
    const [newOrderUserName, setNewOrderUserName] = useState('');
    const [newOrderItems, setNewOrderItems] = useState([{ name: '', quantity: 1 }]);

    const [submitting, setSubmitting] = useState(false);
    const { showToast } = useToast();
    const router = useRouter();

    // Race condition protection
    const activeTripId = useRef(tripId);
    useEffect(() => { activeTripId.current = tripId; }, [tripId]);

    const loadShoppingItems = useCallback(async () => {
        console.time('loadShoppingItems');
        try {
            const ordersData = await ordersApi.getByTrip(tripId);
            if (activeTripId.current !== tripId) return;

            // PERFORMANCE: Use Promise.all to fetch items in parallel
            const itemsPromises = ordersData.map(async (order) => {
                const items = await itemsApi.getByOrder(order.id);
                return { order, items };
            });

            const results = await Promise.all(itemsPromises);

            if (activeTripId.current !== tripId) return;

            const newGroups: Record<string, UserGroup> = {};

            results.forEach(({ order, items }) => {
                const user = order.expand?.user;
                const groupKey = user?.id || order.user_name;
                const displayName = user?.name || order.user_name || 'Desconhecido';
                const avatarUrl = user?.avatar ? `https://pb-orderit.povoas.top/api/files/users/${user.id}/${user.avatar}` : undefined;

                if (!newGroups[groupKey]) {
                    newGroups[groupKey] = {
                        userId: groupKey,
                        userName: displayName,
                        userAvatar: avatarUrl,
                        orderCreated: order.created,
                        items: []
                    };
                }

                items.forEach(item => {
                    newGroups[groupKey].items.push({
                        ...item,
                        user_name: displayName,
                        order_id: order.id,
                        order_created: order.created
                    });
                });
            });

            if (activeTripId.current === tripId) {
                const groupsArray = Object.values(newGroups).sort((a, b) =>
                    new Date(b.orderCreated).getTime() - new Date(a.orderCreated).getTime()
                );

                groupsArray.forEach(group => {
                    group.items.sort((a, b) => a.name.localeCompare(b.name));
                });

                setUserGroups(groupsArray);
            }
        } catch (error) {
            if (activeTripId.current === tripId) {
                console.error(error);
                showToast('Falha ao carregar itens', 'error');
            }
        } finally {
            console.timeEnd('loadShoppingItems');
        }
    }, [tripId, showToast]);

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
        setTrip(null);
        setUserGroups([]);
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

    const cycleStatus = async (item: ShoppingItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const statuses: Item['found_status'][] = ['pending', 'found', 'not_available'];
        const currentIdx = statuses.indexOf(item.found_status);
        const nextStatus = statuses[(currentIdx + 1) % 3];

        // Optimistic UI update
        setUserGroups(prevGroups => {
            return prevGroups.map(group => ({
                ...group,
                items: group.items.map(i =>
                    i.id === item.id ? { ...i, found_status: nextStatus } : i
                )
            }));
        });

        try {
            await itemsApi.updateStatus(item.id, nextStatus);
            // No reload needed if successful, state is already correct
        } catch {
            showToast('Falha ao atualizar estado do produto', 'error');
            // Revert on failure
            setUserGroups(prevGroups => {
                return prevGroups.map(group => ({
                    ...group,
                    items: group.items.map(i =>
                        i.id === item.id ? { ...i, found_status: item.found_status } : i
                    )
                }));
            });
        }
    };

    const openEditItemModal = (item: ShoppingItem) => {
        setSelectedItem(item);
        setItemName(item.name);
        setItemQuantity(item.quantity);
        setItemUnitPrice(item.unit_price || (item.price / item.quantity) || 0);
        setItemStatus(item.found_status);
        setItemBrand(item.brand || 'Official');
        setItemNotes(item.notes || '');
        setShowEditItemModal(true);
    };

    const handleUpdateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        setSubmitting(true);
        const qty = Number(itemQuantity) || 1;
        const uPrice = Number(itemUnitPrice) || 0;

        try {
            await itemsApi.update(selectedItem.id, {
                name: itemName,
                quantity: qty,
                unit_price: uPrice,
                price: uPrice * qty,
                found_status: itemStatus,
                brand: itemBrand,
                notes: itemNotes
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

    const handleDeleteItem = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!selectedItem || !confirm('Tem a certeza de que quer eliminar este produto?')) return;
        setSubmitting(true);
        try {
            await itemsApi.delete(selectedItem.id);
            showToast('Produto eliminado!', 'success');
            setShowEditItemModal(false);
            loadShoppingItems();
        } catch {
            showToast('Falha ao eliminar produto', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddOrderItem = () => {
        setNewOrderItems([...newOrderItems, { name: '', quantity: 1 }]);
    };

    const handleNewOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrderUserName.trim()) return;
        setSubmitting(true);
        try {
            const order = await ordersApi.create({
                trip_id: tripId,
                user_name: newOrderUserName.trim()
            });

            for (const item of newOrderItems) {
                if (item.name.trim()) {
                    await itemsApi.create({
                        order_id: order.id,
                        name: item.name.trim(),
                        quantity: item.quantity,
                        price: 0
                    });
                }
            }

            showToast('Pedido adicionado!', 'success');
            setNewOrderUserName('');
            setNewOrderItems([{ name: '', quantity: 1 }]);
            setShowNewOrderModal(false);
            loadShoppingItems();
        } catch {
            showToast('Falha ao criar pedido', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // AI Handler
    const handleAiSummarize = async () => {
        if (!user?.geminiApiKey) {
            showToast('Configura a tua API Key do Gemini no perfil primeiro!', 'error');
            return;
        }

        setAiLoading(true);
        try {
            // Collect all pending items
            const allItems = userGroups.flatMap(g =>
                g.items
                    .filter(i => i.found_status === 'pending')
                    .map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes }))
            );

            if (allItems.length === 0) {
                showToast('Não há itens por comprar!', 'error');
                setAiLoading(false);
                return;
            }

            const result = await summarizeTrip(allItems, user.geminiApiKey);
            setAiSummary(result);
        } catch (error: any) {
            console.error(error);
            showToast('Erro na IA: ' + error.message, 'error');
        } finally {
            setAiLoading(false);
        }
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
                                ? "bg-white text-[var(--text-primary)] shadow-sm ring-1 ring-black/5"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50",
                            isActive && opt.color // Apply specific color if active and defined
                        )}
                        style={isActive && opt.color ? { color: opt.color, backgroundColor: 'white' } : {}}
                    >
                        {opt.icon && <span className="material-icons text-base">{opt.icon}</span>}
                        {opt.label}
                    </button>
                )
            })}
        </div>
    );

    // Calculate totals
    const allItems = userGroups.flatMap(g => g.items);
    const stats = {
        total: allItems.length,
        pending: allItems.filter(i => i.found_status === 'pending').length,
    };
    const boughtCost = allItems.filter(i => i.found_status === 'found').reduce((s, i) => s + (i.price || 0), 0);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
            <LoadingSpinner size="lg" />
        </div>
    );

    if (!trip) return null;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] has-bottom-nav">
            <Header title="Admin Panel" subtitle={trip.name} showBack />

            <main className="container mx-auto px-4 py-8 max-w-2xl">
                {/* Stats Grid */}
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

                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Pedidos</h2>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setShowNewOrderModal(true)}
                            className="btn-primary h-10 px-4 text-sm"
                        >
                            + Novo Pedido
                        </Button>
                        <button
                            onClick={() => loadShoppingItems()}
                            className="w-10 h-10 rounded-full bg-white border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-violet-600 hover:border-violet-200 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    </div>
                </div>

                {/* AI Banner/Button */}
                <div className="mb-6">
                    <button
                        onClick={() => { setShowAiSheet(true); if (!aiSummary) handleAiSummarize(); }}
                        className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-xl p-4 shadow-lg hover:shadow-xl transition-all hover:scale-[1.01] flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                <span className="text-2xl">✨</span>
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-lg">Assistente IA</div>
                                <div className="text-xs text-white/80">Resumir e organizar a lista de compras</div>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                    </button>
                </div>

                {/* Shopping List - Grouped by User */}
                <div className="space-y-6">
                    {userGroups.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center">
                            <div className="w-20 h-20 mb-4 rounded-full bg-violet-50 flex items-center justify-center text-3xl">
                                🛒
                            </div>
                            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Lista Vazia</h3>
                            <p className="text-[var(--text-secondary)] text-sm mb-6">Nenhum produto pedido para esta viagem.</p>
                        </div>
                    ) : (
                        userGroups.map((group) => {
                            const allProcessed = group.items.length > 0 && group.items.every(i => i.found_status !== 'pending');
                            const allMissing = group.items.length > 0 && group.items.every(i => i.found_status === 'not_available');

                            return (
                                <div key={group.userId} className={cn(
                                    "rounded-[24px] shadow-sm overflow-hidden",
                                    allProcessed ? "p-[3px]" : "border border-[var(--border)]",
                                    allProcessed ? (allMissing ? "bg-red-500" : "bg-gradient-to-r from-violet-600 to-purple-600") : "bg-white"
                                )}>
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
                                        {/* Group Header */}
                                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80 backdrop-blur-sm relative z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="flex -space-x-1 overflow-visible">
                                                    <Avatar name={group.userName} src={group.userAvatar} size="md" className="shadow-sm ring-2 ring-white !text-gray-900" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-[var(--text-primary)] text-lg leading-none mb-1">{group.userName}</h3>
                                                    <p className="text-xs text-[var(--text-muted)] font-medium">
                                                        {group.items.length} {group.items.length === 1 ? 'item' : 'itens'} • {getRelativeTime(group.orderCreated)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider mb-0.5">Total</p>
                                                <p className="text-sm font-black text-[var(--text-primary)]">
                                                    {formatCurrency(group.items.reduce((acc, item) => acc + (item.price || 0), 0))}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Items List */}
                                        <div className="bg-gray-50 p-2 gap-2 flex flex-col">
                                            {group.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className={cn(
                                                        "relative group transition-all duration-200 rounded-[20px] overflow-hidden border border-gray-100 shadow-sm",
                                                        item.found_status === 'found' ? "bg-emerald-50/30" :
                                                            item.found_status === 'not_available' ? "bg-red-50/30" : "bg-white"
                                                    )}
                                                >
                                                    <div className="flex gap-4 items-start p-4 pb-4">
                                                        {/* Image Placeholder or Icon */}
                                                        <div
                                                            onClick={() => openEditItemModal(item)}
                                                            className="w-12 h-12 rounded-2xl bg-[var(--bg-primary)] flex items-center justify-center text-2xl shrink-0 cursor-pointer overflow-hidden border border-gray-100"
                                                        >
                                                            {item.image_url ? (
                                                                <img src={item.image_url} alt={item.name} className="w-full h-full object-contain mix-blend-multiply p-1" />
                                                            ) : (
                                                                <span>{getProductEmoji(item.name)}</span>
                                                            )}
                                                        </div>

                                                        <div className="flex-1 min-w-0 flex flex-col justify-center" onClick={() => openEditItemModal(item)}>
                                                            <div className="flex justify-between items-start gap-2 cursor-pointer mb-1">
                                                                <h4 className={cn(
                                                                    "font-bold text-[var(--text-primary)] text-base leading-tight",
                                                                    item.found_status !== 'pending' && "opacity-50 line-through"
                                                                )}>
                                                                    {item.name}
                                                                </h4>
                                                                <div className="text-right flex flex-col items-end">
                                                                    <span className="font-bold text-[var(--text-primary)] whitespace-nowrap">
                                                                        {item.price > 0 ? formatCurrency(item.price) : formatCurrency(0)}
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

                                                    {/* Notes - Full Width, glued to status bar */}
                                                    {item.notes && (
                                                        <div className="bg-yellow-50 text-yellow-900 text-sm py-2 px-4 border-l-4 border-yellow-400 flex items-start gap-2 w-full">
                                                            <span className="font-bold shrink-0">Notas:</span>
                                                            <span className="italic">{item.notes}</span>
                                                        </div>
                                                    )}

                                                    {/* Status Bar / Cycle Button */}
                                                    <div
                                                        onClick={(e) => cycleStatus(item, e)}
                                                        className={cn(
                                                            "w-full py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-white cursor-pointer active:brightness-90 transition-all select-none",
                                                            item.found_status === 'pending' ? "bg-amber-500 text-amber-700 hover:bg-amber-600" :
                                                                item.found_status === 'found' ? "bg-emerald-500" : "bg-red-500"
                                                        )}
                                                    >
                                                        {item.found_status === 'pending' ? (
                                                            <span className="flex items-center gap-1">
                                                                <span className="material-icons text-sm">hourglass_empty</span>
                                                                Por comprar
                                                            </span>
                                                        ) : item.found_status === 'found' ? (
                                                            <>
                                                                <span className="material-icons text-sm">check</span>
                                                                Comprado
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="material-icons text-sm">close</span>
                                                                Não tinha
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </main>

            {/* Edit Item Modal */}
            <Modal isOpen={showEditItemModal} onClose={() => setShowEditItemModal(false)}>
                <ModalHeader>
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-100 text-violet-600 rounded-lg">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </div>
                            <h2 className="text-xl font-bold">Editar Produto</h2>
                        </div>
                        <Button
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 w-10 h-10 p-0 rounded-xl"
                            onClick={handleDeleteItem}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </Button>
                    </div>
                </ModalHeader>
                <form onSubmit={handleUpdateItem}>
                    <ModalBody className="space-y-4 pt-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Nome</label>
                                <input type="text" value={itemName} onChange={e => setItemName(e.target.value)} className="input" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Qtd.</label>
                                <input type="number" min="1" value={itemQuantity} onChange={e => setItemQuantity(e.target.value)} className="input text-center font-bold" required />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Marca</label>
                                <SegmentedControl
                                    value={itemBrand === 'Official' || itemBrand === 'official' ? 'Official' : 'Off-brand'}
                                    onChange={(v) => setItemBrand(v)}
                                    options={[
                                        { value: 'Official', label: 'Original' },
                                        { value: 'Off-brand', label: 'Branca' }
                                    ]}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Preço Unit. (€)</label>
                                <input type="number" min="0" step="0.01" value={itemUnitPrice} onChange={e => setItemUnitPrice(e.target.value)} className="input" placeholder="0.00" />
                            </div>
                        </div>

                        <div className="mt-2 p-3 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border)]">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Total Calculado</label>
                            <div className="text-lg font-black text-[var(--text-primary)]">
                                {formatCurrency((Number(itemUnitPrice) || 0) * (Number(itemQuantity) || 0))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Estado</label>
                            <SegmentedControl
                                value={itemStatus}
                                onChange={setItemStatus}
                                options={[
                                    { value: 'pending', label: 'Por comprar', icon: 'hourglass_empty', color: '#f59e0b' },
                                    { value: 'found', label: 'Comprado', icon: 'check', color: '#10b981' },
                                    { value: 'not_available', label: 'Não tinha', icon: 'close', color: '#ef4444' }
                                ]}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Notas</label>
                            <textarea value={itemNotes} onChange={e => setItemNotes(e.target.value)} className="input text-sm" rows={2} placeholder="Marca específica, alternativa, etc..."></textarea>
                        </div>
                    </ModalBody>
                    <ModalFooter className="flex gap-3 justify-end mt-4">
                        <Button type="button" variant="ghost" onClick={() => setShowEditItemModal(false)}>Cancelar</Button>
                        <Button type="submit" disabled={submitting} className="btn-primary px-8">
                            {submitting ? 'A guardar...' : 'Guardar'}
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>

            {/* AI Sheet */}
            {showAiSheet && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAiSheet(false)} />
                    <div className="relative bg-white w-full max-w-2xl sm:rounded-2xl h-[85vh] sm:h-[80vh] flex flex-col shadow-2xl animate-fade-in-up">
                        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-2xl">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">✨</span>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900">Resumo Inteligente</h3>
                                    <p className="text-xs text-gray-500">Organizado por Gemini AI</p>
                                </div>
                            </div>
                            <button onClick={() => setShowAiSheet(false)} className="p-2 hover:bg-black/5 rounded-full">
                                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4">
                                    <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                    <p className="text-indigo-600 font-medium animate-pulse">A analisar a tua lista...</p>
                                </div>
                            ) : aiSummary ? (
                                <div className="space-y-6">
                                    {aiSummary.categories?.map((cat: any, idx: number) => (
                                        <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                            <h4 className="flex items-center gap-2 font-bold text-gray-800 mb-3 text-lg">
                                                <span>{cat.emoji || '📦'}</span>
                                                {cat.name}
                                            </h4>
                                            <div className="space-y-2">
                                                {cat.items?.map((item: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                                                        <span className="font-medium text-gray-700">{item.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            {item.notes && <span className="text-[10px] text-gray-400 max-w-[100px] truncate">{item.notes}</span>}
                                                            <Badge variant="info">
                                                                x{item.total_quantity}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="text-center pt-4">
                                        <button
                                            onClick={handleAiSummarize}
                                            className="text-sm text-indigo-600 hover:underline font-medium"
                                        >
                                            Regerar resumo
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 text-gray-500">
                                    <p>Falha ao gerar resumo.</p>
                                    <button onClick={handleAiSummarize} className="mt-4 text-indigo-600 font-bold">Tentar novamente</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* New Order Modal */}
            <Modal isOpen={showNewOrderModal} onClose={() => setShowNewOrderModal(false)}>
                <ModalHeader>
                    <div className="flex items-center gap-3 text-violet-600">
                        <div className="p-2 bg-violet-100 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Novo Pedido</h2>
                            <p className="text-xs text-[var(--text-muted)] font-normal">Adicionar produtos em nome de um utilizador</p>
                        </div>
                    </div>
                </ModalHeader>
                <form onSubmit={handleNewOrder}>
                    <ModalBody className="space-y-4 pt-4">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Nome do Utilizador</label>
                            <input type="text" value={newOrderUserName} onChange={e => setNewOrderUserName(e.target.value)} className="input" placeholder="ex: João Silva" required />
                        </div>

                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Produtos</label>
                            {newOrderItems.map((item, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={item.name}
                                        onChange={e => {
                                            const updated = [...newOrderItems];
                                            updated[idx].name = e.target.value;
                                            setNewOrderItems(updated);
                                        }}
                                        className="input flex-1"
                                        placeholder="Nome do produto..."
                                        required
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={e => {
                                            const updated = [...newOrderItems];
                                            updated[idx].quantity = parseInt(e.target.value) || 1;
                                            setNewOrderItems(updated);
                                        }}
                                        className="input w-20 text-center font-bold"
                                        required
                                    />
                                </div>
                            ))}
                            <button type="button" onClick={handleAddOrderItem} className="text-violet-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1 hover:underline mt-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                Adicionar outro produto
                            </button>
                        </div>
                    </ModalBody>
                    <ModalFooter className="flex gap-3 justify-end mt-4">
                        <Button type="button" variant="ghost" onClick={() => setShowNewOrderModal(false)}>Cancelar</Button>
                        <Button type="submit" disabled={submitting} className="btn-primary px-6">
                            {submitting ? 'A criar...' : 'Criar Pedido'}
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
