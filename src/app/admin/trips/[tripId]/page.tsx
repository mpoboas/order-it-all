'use client';

import { useEffect, useState, useCallback, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { tripsApi, ordersApi, itemsApi, subscriptions } from '@/lib/pocketbase';
import { scanInvoice } from '@/app/actions/ocr';
import { reconcileInvoice } from '@/app/actions/ai';
import { useUser } from '@/context/UserContext';
import type { Trip, Item } from '@/lib/types';
import { getInitials, formatCurrency, getProductEmoji, cn, getPacificDateString, getRelativeTime } from '@/lib/utils';
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
    const { user, updateProfile } = useUser();

    // Invoice Scanner State
    const [showScanSheet, setShowScanSheet] = useState(false);
    const [scanStep, setScanStep] = useState<'upload' | 'processing' | 'review'>('upload');
    const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
    const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
    const [scanResult, setScanResult] = useState<{
        matches: { itemId: string; price: number; quantity: number; foundName: string }[];
        extras: { id: string; name: string; price: number; quantity: number; unit_price: number; selected?: boolean }[];
    } | null>(null);
    const [apiKeyInput, setApiKeyInput] = useState('');


    // Camera State
    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Initial Camera Start when Sheet Opens
    useEffect(() => {
        if (showScanSheet && scanStep === 'upload' && !invoicePreview) {
            const startCamera = async () => {
                try {
                    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); // Use back camera if possible
                    setStream(mediaStream);
                    if (videoRef.current) {
                        videoRef.current.srcObject = mediaStream;
                    }
                } catch (err) {
                    console.warn("Camera access denied or not available", err);
                }
            };
            startCamera();
        } else {
            // Stop camera if sheet closes or we leave upload step
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
        }
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [showScanSheet, scanStep]); // Re-run if these change

    // Ref update
    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                context.drawImage(videoRef.current, 0, 0);

                canvasRef.current.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], "invoice-capture.png", { type: "image/png" });
                        setInvoiceFile(file);
                        setInvoicePreview(URL.createObjectURL(file));
                    }
                }, 'image/png');

                // Stop camera
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                }
            }
        }
    };

    const handleRetake = () => {
        setInvoiceFile(null);
        setInvoicePreview(null);
        // Effect will restart camera because scanStep is 'upload' and invoicePreview becomes null
    };

    // Override original handleFileChange to stop camera
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setInvoiceFile(file);
            setInvoicePreview(URL.createObjectURL(file));

            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
        }
    };
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



    const handleProcessInvoice = async () => {
        if (!invoiceFile || !user?.geminiApiKey) {
            showToast(!invoiceFile ? 'Seleciona uma fatura' : 'Configura a API Key', 'error');
            return;
        }

        setScanStep('processing');
        try {
            // 1. OCR
            const text = await scanInvoice(imageToFormData(invoiceFile));
            console.log('OCR Text:', text);

            // 2. Reconciliation
            const allItems = userGroups.flatMap(g => g.items.map(i => ({
                id: i.id, name: i.name, quantity: i.quantity, notes: i.notes
            })));

            const result = await reconcileInvoice(text, allItems, user.geminiApiKey);

            // Update RPD
            const today = getPacificDateString();
            const currentCount = user.last_request_date === today ? (user.daily_requests_count || 0) : 0;
            updateProfile({
                daily_requests_count: currentCount + 1,
                last_request_date: today
            }).catch(console.error); // optimistic update/background

            // Add selection state and temp IDs to extras
            const processedResult = {
                ...result,
                extras: result.extras.map((e, idx) => ({ ...e, id: `extra-${idx}`, selected: true }))
            };

            setScanResult(processedResult);
            setScanStep('review');
        } catch (error: any) {
            console.error(error);
            showToast(error.message, 'error');
            setScanStep('upload');
        }
    };

    const handleConfirmReconciliation = async () => {
        if (!scanResult) return;
        setSubmitting(true);

        try {
            // 1. Update Matched Prices & Quantities
            const updatePromises = scanResult.matches.map(m =>
                itemsApi.update(m.itemId, {
                    price: m.price,
                    quantity: m.quantity || 1, // Ensure quantity is updated
                    found_status: 'found' // Mark as found
                })
            );

            // 2. Create Extras Order (if any selected)
            const selectedExtras = scanResult.extras.filter(e => e.selected);
            let extrasPromise = Promise.resolve();

            if (selectedExtras.length > 0) {
                extrasPromise = (async () => {
                    const order = await ordersApi.create({
                        trip_id: tripId,
                        user_name: 'Geral',
                        user_id: null
                    });

                    for (const extra of selectedExtras) {
                        await itemsApi.create({
                            order_id: order.id,
                            name: extra.name,
                            quantity: extra.quantity,
                            price: extra.price,
                            found_status: 'found' // Already bought
                        });
                    }
                })();
            }

            await Promise.all([...updatePromises, extrasPromise]);

            showToast('Preços atualizados e extras adicionados!', 'success');
            setShowScanSheet(false);
            loadShoppingItems();

            // Reset
            setInvoiceFile(null);
            setInvoicePreview(null);
            setScanResult(null);
            setScanStep('upload');

        } catch (error) {
            console.error(error);
            showToast('Erro ao aplicar alterações', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Helper: Get all available items for matching (not currently matched)
    const getUnmatchedItems = () => {
        if (!scanResult) return [];
        const matchedIds = new Set(scanResult.matches.map(m => m.itemId));
        return userGroups.flatMap(g => g.items).filter(i => !matchedIds.has(i.id));
    };

    // Match Correction Handlers
    const handleUpdateMatch = (currentMatchIndex: number, newItemId: string) => {
        if (!scanResult) return;
        const newMatches = [...scanResult.matches];
        newMatches[currentMatchIndex].itemId = newItemId;
        setScanResult({
            ...scanResult,
            matches: newMatches
        });
    };

    const handleUnmatchItem = (matchIndex: number) => {
        if (!scanResult) return;
        const match = scanResult.matches[matchIndex];
        const newMatches = scanResult.matches.filter((_, i) => i !== matchIndex);

        // Add to extras
        const newExtra = {
            id: `unmatched-${Date.now()}`,
            name: match.foundName,
            price: match.price,
            quantity: 1,
            unit_price: match.price,
            selected: true
        };

        setScanResult({
            matches: newMatches,
            extras: [newExtra, ...scanResult.extras]
        });
    };

    const handleMatchExtra = (extraIndex: number, targetItemId: string) => {
        if (!scanResult) return;
        const extra = scanResult.extras[extraIndex];

        // Remove from extras
        const newExtras = scanResult.extras.filter((_, i) => i !== extraIndex);

        // Add to matches
        const newMatch = {
            itemId: targetItemId,
            price: extra.price,
            quantity: extra.quantity,
            foundName: extra.name
        };

        setScanResult({
            matches: [...scanResult.matches, newMatch],
            extras: newExtras
        });
    };

    const imageToFormData = (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return formData;
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
    const allItems = userGroups.flatMap(g => g.items); // Re-calculated for render, or could use the one from handleProcessInvoice if moved up

    const stats = {
        total: allItems.length,
        pending: allItems.filter(i => i.found_status === 'pending').length,
    };
    const boughtCost = allItems.filter(i => i.found_status === 'found').reduce((s, i) => s + (i.price || 0), 0);

    // Save API Key Handler
    const handleSaveApiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKeyInput.trim()) return;

        setSubmitting(true);
        try {
            await updateProfile({ geminiApiKey: apiKeyInput.trim() });
            setApiKeyInput(''); // Clear input after save
        } catch (error) {
            console.error('Failed to save API key', error);
        } finally {
            setSubmitting(false);
        }
    };

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
                            onClick={() => { setShowScanSheet(true); }}
                            variant="secondary"
                            className="h-10 w-10 p-0 rounded-full flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
                            title="Scan Fatura"
                        >
                            <span className="text-xl">📸</span>
                        </Button>
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
            </main >

            {/* Edit Item Modal */}
            < Modal isOpen={showEditItemModal} onClose={() => setShowEditItemModal(false)
            }>
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
            </Modal >

            {/* Invoice Scanner Sheet */}
            {
                showScanSheet && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowScanSheet(false)} />
                        <div className="relative bg-white w-full max-w-2xl sm:rounded-2xl h-[90vh] sm:h-[85vh] flex flex-col shadow-2xl animate-fade-in-up overflow-hidden">

                            {/* Header */}
                            <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg shadow-sm">
                                        <span className="text-2xl">🧾</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900">Scan da Fatura</h3>
                                        <p className="text-xs text-gray-500">OCR + Gemini AI</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowScanSheet(false)} className="p-2 hover:bg-black/5 rounded-full">
                                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50">

                                {/* ZERO STEP: API Key Check */}
                                {scanStep === 'upload' && !user?.geminiApiKey ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-6 text-center max-w-sm mx-auto">
                                        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11.536 9.636a1.003 1.003 0 00-.454-.68l-2.478-.992a2.828 2.828 0 00-2.448.374l-.921 1.123c-.438.532-.352 1.348.146 1.786l2.123 1.861a1 1 0 00.55.201h2.596a1 1 0 00.55-.201l.921-.765a2.768 2.768 0 011.59-.516h2.296m-1.935 4.908a6 6 0 10-10.971-6.375" /></svg>
                                        </div>

                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900 mb-2">Configurar Gemini AI</h3>
                                            <p className="text-sm text-gray-500 mb-6">Esta funcionalidade requer uma chave pessoal do Google Gemini.</p>

                                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-left mb-6">
                                                <p className="text-xs text-blue-800 leading-relaxed">
                                                    Obtém a tua chave de API gratuita aqui: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="font-bold underline">aistudio.google.com</a>
                                                </p>
                                            </div>

                                            <form onSubmit={handleSaveApiKey} className="w-full space-y-3">
                                                <input
                                                    type="text"
                                                    value={apiKeyInput}
                                                    onChange={e => setApiKeyInput(e.target.value)}
                                                    className="input text-center font-mono text-sm"
                                                    placeholder="Cola a tua API Key aqui..."
                                                    required
                                                />
                                                <Button type="submit" disabled={submitting} className="btn-primary w-full shadow-lg shadow-blue-100">
                                                    {submitting ? 'A guardar...' : 'Guardar e Continuar'}
                                                </Button>
                                            </form>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Step 1: Upload */}
                                        {scanStep === 'upload' && (
                                            <div className="flex flex-col items-center justify-center h-full space-y-4">
                                                <canvas ref={canvasRef} className="hidden" />

                                                {invoicePreview ? (
                                                    <div className="relative w-full max-w-sm aspect-[3/4] rounded-xl overflow-hidden shadow-lg border-4 border-white">
                                                        <img src={invoicePreview} alt="Invoice Preview" className="w-full h-full object-cover" />
                                                        <button
                                                            onClick={handleRetake}
                                                            className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center w-full max-w-sm gap-4">
                                                        {/* Camera View */}
                                                        <div className="relative w-full aspect-[3/4] bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
                                                            {stream ? (
                                                                <video
                                                                    ref={videoRef}
                                                                    autoPlay
                                                                    muted
                                                                    playsInline
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="text-gray-500 flex flex-col items-center">
                                                                    <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                    <span>A iniciar câmara...</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Controls */}
                                                        <div className="flex flex-col items-center gap-2 w-full">
                                                            {stream && (
                                                                <button
                                                                    onClick={handleCapture}
                                                                    className="w-full py-3 bg-white border border-gray-200 shadow-sm rounded-xl font-bold text-gray-900 flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-95 transition-all"
                                                                >
                                                                    <div className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-500"></div>
                                                                    Capturar Foto
                                                                </button>
                                                            )}

                                                            <div className="relative w-full">
                                                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                                                    <div className="w-full border-t border-gray-200"></div>
                                                                </div>
                                                                <div className="relative flex justify-center text-sm">
                                                                    <span className="px-2 bg-gray-50 text-gray-500">ou</span>
                                                                </div>
                                                            </div>

                                                            <label className="w-full py-3 bg-white border-dashed border-2 border-gray-300 rounded-xl font-medium text-gray-500 flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all">
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                                Carregar da Galeria
                                                                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                                            </label>
                                                        </div>
                                                    </div>
                                                )}

                                                {invoiceFile && (
                                                    <div className="w-full max-w-sm">
                                                        <Button
                                                            onClick={handleProcessInvoice}
                                                            className={cn(
                                                                "btn-primary w-full py-3 h-auto shadow-xl shadow-emerald-200 relative overflow-hidden group flex flex-col items-center justify-center gap-1",
                                                                // Disable styling manually if needed, or rely on disabled prop. 
                                                                // Adding specific gray scale when disabled for clarity if btn-primary doesn't handle it strongly enough.
                                                                (() => {
                                                                    const LIMIT = 20;
                                                                    const today = getPacificDateString();
                                                                    const count = user.last_request_date === today ? (user.daily_requests_count || 0) : 0;
                                                                    return count >= LIMIT ? "bg-gray-400 border-gray-400 shadow-none pointer-events-none" : "";
                                                                })()
                                                            )}
                                                            disabled={(() => {
                                                                const LIMIT = 20;
                                                                const today = getPacificDateString();
                                                                const count = user.last_request_date === today ? (user.daily_requests_count || 0) : 0;
                                                                return count >= LIMIT;
                                                            })()}
                                                        >
                                                            <div className="relative z-10 flex flex-col items-center">
                                                                <span className="text-lg font-bold flex items-center gap-2">
                                                                    Processar Fatura ✨
                                                                </span>
                                                                {(() => {
                                                                    const LIMIT = 20;
                                                                    const today = getPacificDateString();
                                                                    const count = user.last_request_date === today ? (user.daily_requests_count || 0) : 0;

                                                                    if (count >= LIMIT) {
                                                                        return <span className="text-[10px] text-red-100 font-bold tracking-wide">Atingiste o teu limite diário de pedidos.</span>;
                                                                    }
                                                                    if (count > 0) {
                                                                        return (
                                                                            <span className="text-[10px] opacity-90 font-medium tracking-wide">
                                                                                Já fizeste {count}/{LIMIT} pedidos que tens disponíveis para hoje.
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>

                                                            {/* RPD Progress Bar Background */}
                                                            <div
                                                                className="absolute bottom-0 left-0 h-1.5 bg-black/20 transition-all duration-300 w-full"
                                                            >
                                                                <div
                                                                    className="h-full bg-emerald-800/40 transition-all duration-300"
                                                                    style={{
                                                                        width: `${Math.min(((() => {
                                                                            const today = getPacificDateString();
                                                                            const count = user.last_request_date === today ? (user.daily_requests_count || 0) : 0;
                                                                            return count;
                                                                        })() / 20) * 100, 100)}%`
                                                                    }}
                                                                />
                                                            </div>
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Step 2: Processing */}
                                        {scanStep === 'processing' && (
                                            <div className="flex flex-col items-center justify-center h-full space-y-6 text-center p-8">
                                                <div className="relative">
                                                    <div className="w-24 h-24 border-4 border-emerald-100 rounded-full animate-spin border-t-emerald-500"></div>
                                                    <div className="absolute inset-0 flex items-center justify-center text-4xl animate-pulse">🤖</div>
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-gray-900 mb-2">A ler a fatura...</h3>
                                                    <p className="text-gray-500">A identificar produtos, preços e a comparar com a tua lista.</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Step 3: Review */}
                                        {scanStep === 'review' && scanResult && (
                                            <div className="space-y-6 pb-20">
                                                {/* Matches Section */}
                                                <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
                                                    <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex justify-between items-center">
                                                        <h4 className="font-bold text-emerald-800 flex items-center gap-2">
                                                            <span className="material-icons text-sm">check_circle</span>
                                                            Encontrados ({scanResult.matches.length})
                                                        </h4>
                                                        <span className="text-xs font-medium text-emerald-600">Verifique as associações</span>
                                                    </div>
                                                    <div className="divide-y divide-gray-100">
                                                        {scanResult.matches.length === 0 ? (
                                                            <p className="p-4 text-center text-gray-400 text-sm">Nenhum item correspondido automaticamente.</p>
                                                        ) : (
                                                            scanResult.matches.map((m, i) => {
                                                                const originalItem = userGroups.flatMap(g => g.items).find(item => item.id === m.itemId);
                                                                const unmatched = getUnmatchedItems();

                                                                return (
                                                                    <div key={i} className="p-3 hover:bg-gray-50 flex flex-col gap-2">
                                                                        <div className="flex justify-between items-start">
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Fatura</span>
                                                                                    <span className="text-sm font-medium text-gray-700 truncate">{m.foundName}</span>
                                                                                </div>

                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">App</span>
                                                                                    {/* Dropdown for correcting match */}
                                                                                    <select
                                                                                        className="text-sm font-bold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:border-emerald-500 focus:ring-0 py-0.5 pr-6 pl-0 cursor-pointer max-w-[200px]"
                                                                                        value={m.itemId}
                                                                                        onChange={(e) => handleUpdateMatch(i, e.target.value)}
                                                                                    >
                                                                                        <option value={m.itemId}>{originalItem?.name} ({originalItem?.user_name})</option>
                                                                                        <optgroup label="Outros por comprar">
                                                                                            {unmatched.map(u => (
                                                                                                <option key={u.id} value={u.id}>
                                                                                                    {u.name} ({u.user_name})
                                                                                                </option>
                                                                                            ))}
                                                                                        </optgroup>
                                                                                    </select>
                                                                                </div>
                                                                            </div>

                                                                            <div className="text-right flex flex-col items-end gap-1">
                                                                                <p className="font-bold text-emerald-600">{formatCurrency(m.price)}</p>
                                                                                {/* Show Qty diff if any */}
                                                                                {m.quantity !== originalItem?.quantity && (
                                                                                    <p className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1 rounded">
                                                                                        Qtd: {originalItem?.quantity} → {m.quantity}
                                                                                    </p>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => handleUnmatchItem(i)}
                                                                                    className="text-gray-400 hover:text-red-500 p-1"
                                                                                    title="Desassociar (mover para extras)"
                                                                                >
                                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Extras Section */}
                                                <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
                                                    <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex justify-between items-center">
                                                        <h4 className="font-bold text-amber-800 flex items-center gap-2">
                                                            <span className="material-icons text-sm">add_shopping_cart</span>
                                                            Extras ({scanResult.extras.length})
                                                        </h4>
                                                        <span className="text-xs font-medium text-amber-600">Novos itens ou associe existentes</span>
                                                    </div>
                                                    <div className="divide-y divide-gray-100">
                                                        {scanResult.extras.length === 0 ? (
                                                            <p className="p-4 text-center text-gray-400 text-sm">Nenhum item extra detetado.</p>
                                                        ) : (
                                                            scanResult.extras.map((e, i) => (
                                                                <div key={e.id || i} className={cn("p-3 transition-colors", e.selected ? "bg-amber-50/30" : "bg-white")}>
                                                                    <div className="flex gap-3 items-start">
                                                                        <div
                                                                            className={cn("mt-1 w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors shrink-0", e.selected ? "bg-amber-500 border-amber-500 text-white" : "border-gray-300 bg-white")}
                                                                            onClick={() => {
                                                                                const newExtras = [...scanResult.extras];
                                                                                newExtras[i].selected = !newExtras[i].selected;
                                                                                setScanResult({ ...scanResult, extras: newExtras });
                                                                            }}
                                                                        >
                                                                            {e.selected && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                                        </div>

                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex justify-between items-start">
                                                                                <div>
                                                                                    <p className="font-bold text-gray-800 text-sm">{e.name}</p>
                                                                                    <div className="flex gap-2 text-xs text-gray-500">
                                                                                        <span>{e.quantity} un.</span>
                                                                                        <span>•</span>
                                                                                        <span>{formatCurrency(e.unit_price)}/un</span>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="font-bold text-amber-600">{formatCurrency(e.price)}</div>
                                                                            </div>

                                                                            {/* Match to existing item dropdown */}
                                                                            <div className="mt-2 text-xs">
                                                                                <select
                                                                                    className="w-full bg-white border border-gray-200 rounded-lg text-gray-600 py-1.5 px-2 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                                                                                    value=""
                                                                                    onChange={(ev) => handleMatchExtra(i, ev.target.value)}
                                                                                >
                                                                                    <option value="" disabled>Associar a pedido existente...</option>
                                                                                    {getUnmatchedItems().map(u => (
                                                                                        <option key={u.id} value={u.id}>
                                                                                            Link: {u.name} ({u.user_name})
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Footer Actions (Review Only) */}
                            {scanStep === 'review' && (
                                <div className="p-4 pb-8 sm:p-4 bg-white border-t flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                    <Button variant="ghost" className="flex-1" onClick={() => setScanStep('upload')}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={handleConfirmReconciliation}
                                        className="flex-[2] btn-primary bg-emerald-600 hover:bg-emerald-700"
                                        disabled={submitting}
                                    >
                                        {submitting ? 'A aplicar...' : 'Confirmar Alterações'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

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
        </div >
    );
}
