import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sheet, SheetSize } from '@/components/ui/Sheet';
import { AnimatedStep } from '@/components/ui/AnimatedStep';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { OrderParticipantsPicker } from '@/components/features/OrderParticipantsPicker';
import { formatCurrency, cn } from '@/lib/utils';
import { Item, User } from '@/lib/types';
import {
    OrderAudienceType,
    deriveOrderUserName,
    getOrderAudienceSubtitle,
    getUserAvatarUrl,
} from '@/lib/orderParticipants';
import { useWebHaptics } from 'web-haptics/react';
import { useToast } from '@/context/ToastContext';

type OrderFormStep = 'audience' | 'participants' | 'items';

const STEP_ORDER: Record<OrderFormStep, number> = {
    audience: 0,
    participants: 1,
    items: 2,
};

export interface OrderSubmitData {
    items: ItemFormData[];
    userId?: string;
    userName?: string;
    participantIds?: string[];
    audienceType?: OrderAudienceType;
}

export interface ItemFormData {
    name: string;
    quantity: number;
    unit_price: number;
    brand: 'Official' | 'Off-brand' | '';
    notes: string;
    image_url: string;
    found_status?: Item['found_status']; // Added for Admin Edit
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

interface OrderFormSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: OrderSubmitData) => Promise<void>;
    onDelete?: () => Promise<void>;
    /** Admin edit item: open move-to-order flow */
    onMoveToOtherOrder?: () => void;
    initialItems?: ItemFormData[];
    title: string;
    submitLabel: string;
    submitting: boolean;
    mode?: 'multi' | 'single';
    isAdmin?: boolean;
    users?: User[];
    initialUser?: { name: string; id: string };
    /** Create flow with audience wizard (member + admin); edit skips to items */
    flow?: 'create' | 'edit';
    groupMembers?: User[];
    currentUserId?: string;
    initialParticipantIds?: string[];
    minimized?: boolean;
    onMinimize?: () => void;
    onExpand?: () => void;
    onDiscard?: () => void;
    minimizedAboveBottomNav?: boolean;
    onDraftActiveChange?: (active: boolean) => void;
}

function normalizeParticipantIds(ids: string[]): string {
    return [...ids].sort().join(',');
}

function snapshotOrderItems(items: ItemFormData[]): string {
    return JSON.stringify(
        items.map((i) => ({
            name: i.name.trim(),
            quantity: Number(i.quantity) || 1,
            unit_price: Number(i.unit_price) || 0,
            brand: i.brand || '',
            notes: (i.notes || '').trim(),
            image_url: i.image_url || '',
            found_status: i.found_status || 'pending',
        }))
    );
}

const DEFAULT_ITEMS: ItemFormData[] = [];
const DEFAULT_USERS: User[] = [];
const EMPTY_PARTICIPANT_IDS: string[] = [];
const EMPTY_GROUP_MEMBERS: User[] = [];

/** SuperSave product search (disabled: CORS / API unreliable from browser) */
const ENABLE_PRODUCT_SEARCH = false;

const BRAND_CHOICES: { value: 'Official' | 'Off-brand'; label: string }[] = [
    { value: 'Official', label: 'Marca original' },
    { value: 'Off-brand', label: 'Marca branca' },
];

const EMPTY_ITEM = (): ItemFormData => ({
    name: '',
    quantity: 1,
    unit_price: 0,
    brand: '',
    notes: '',
    image_url: '',
});

function isBrandSelected(brand: string): brand is 'Official' | 'Off-brand' {
    return brand === 'Official' || brand === 'Off-brand';
}

function normalizeFormBrand(brand?: string): '' | 'Official' | 'Off-brand' {
    if (brand === 'Official' || brand === 'Off-brand') return brand;
    return '';
}

function scrollItemCardIntoView(card: HTMLElement) {
    let parent = card.parentElement;
    while (parent) {
        const { overflowY } = getComputedStyle(parent);
        if (overflowY === 'auto' || overflowY === 'scroll') {
            const cardTop = card.getBoundingClientRect().top;
            const parentTop = parent.getBoundingClientRect().top;
            const top = cardTop - parentTop + parent.scrollTop - 12;
            parent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            return;
        }
        parent = parent.parentElement;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function OrderFormSheet({
    isOpen,
    onClose,
    onSubmit,
    onDelete,
    onMoveToOtherOrder,
    initialItems = DEFAULT_ITEMS,
    title,
    submitLabel,
    submitting,
    mode = 'multi',
    isAdmin = false,
    users = DEFAULT_USERS,
    initialUser,
    flow = 'create',
    groupMembers = EMPTY_GROUP_MEMBERS,
    currentUserId = '',
    initialParticipantIds = EMPTY_PARTICIPANT_IDS,
    minimized = false,
    onMinimize,
    onExpand,
    onDiscard,
    minimizedAboveBottomNav = true,
    onDraftActiveChange,
}: OrderFormSheetProps) {
    const useCreateWizard =
        mode === 'multi' &&
        flow === 'create' &&
        groupMembers.length > 0 &&
        (!isAdmin ? !!currentUserId : true);

    const [step, setStep] = useState<OrderFormStep>(
        () => (flow === 'edit' ? 'items' : useCreateWizard ? 'audience' : 'items')
    );
    const [stepDirection, setStepDirection] = useState(1);
    const [audienceType, setAudienceType] = useState<OrderAudienceType | null>(null);

    const navigateToStep = useCallback((next: OrderFormStep) => {
        setStepDirection(STEP_ORDER[next] >= STEP_ORDER[step] ? 1 : -1);
        setStep(next);
    }, [step]);
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
    const [items, setItems] = useState<ItemFormData[]>([EMPTY_ITEM()]);
    const [userId, setUserId] = useState('');
    const [userName, setUserName] = useState('');
    const [comboboxOpen, setComboboxOpen] = useState(false);
    const { trigger } = useWebHaptics();
    const { showToast } = useToast();

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const wasOpenRef = useRef(false);
    const hasAutoSearchedRef = useRef(false);
    const pendingScrollIndexRef = useRef<number | null>(null);
    const itemCardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [priceExpandedByIndex, setPriceExpandedByIndex] = useState<boolean[]>([]);

    const applyOpenState = () => {
        setStepDirection(1);
        if (flow === 'edit') {
            setStep('items');
            setSelectedParticipantIds([...initialParticipantIds]);
        } else if (useCreateWizard) {
            setStep('audience');
            setAudienceType(null);
            setSelectedParticipantIds(isAdmin ? [] : (currentUserId ? [currentUserId] : []));
        } else {
            setStep('items');
            setSelectedParticipantIds([]);
        }
        if (initialItems.length > 0) {
            const mapped = initialItems.map(i => ({
                ...i,
                quantity: i.quantity || 1,
                unit_price: i.unit_price || 0,
                brand: normalizeFormBrand(i.brand),
                notes: i.notes || '',
                image_url: i.image_url || '',
                found_status: i.found_status || 'pending',
            }));
            setItems(mapped);
            setPriceExpandedByIndex(mapped.map(i => (i.unit_price || 0) > 0));
        } else {
            setItems([EMPTY_ITEM()]);
            setPriceExpandedByIndex([false]);
        }

        if (initialUser) {
            setUserName(initialUser.name);
            setUserId(initialUser.id);
        } else {
            setUserName('');
            setUserId('');
        }

        setSearchQuery('');
        setSearchResults([]);
        hasAutoSearchedRef.current = false;
    };

    // Reset form only when the sheet opens (not on every parent re-render)
    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }
        if (wasOpenRef.current) return;
        wasOpenRef.current = true;
        applyOpenState();
    }, [isOpen, flow, useCreateWizard, isAdmin, currentUserId, initialItems, initialUser, initialParticipantIds]);

    useEffect(() => {
        const idx = pendingScrollIndexRef.current;
        if (idx == null || idx >= items.length) return;
        pendingScrollIndexRef.current = null;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const card = itemCardRefs.current[idx];
                if (card) scrollItemCardIntoView(card);
            });
        });
    }, [items.length]);

    // --- Actions ---

    const updateItem = (index: number, field: keyof ItemFormData, value: any) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
            setPriceExpandedByIndex(prev => prev.filter((_, i) => i !== index));
        }
    };

    const showPriceForItem = (index: number, item: ItemFormData) =>
        isAdmin || priceExpandedByIndex[index] || (item.unit_price || 0) > 0;

    const addEmptyItem = () => {
        trigger();
        pendingScrollIndexRef.current = items.length;
        setItems([...items, EMPTY_ITEM()]);
        setPriceExpandedByIndex(prev => [...prev, false]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const namedItems = items.filter(i => i.name.trim());
        if (namedItems.length === 0) return;
        if (namedItems.some(i => !isBrandSelected(i.brand))) {
            showToast('Escolhe a marca em cada produto', 'error');
            return;
        }
        const validItems = namedItems;
        trigger('success');
        onSubmit({
            items: validItems,
            userId,
            userName,
            participantIds: useCreateWizard || flow === 'edit' ? selectedParticipantIds : undefined,
            audienceType: useCreateWizard ? (audienceType || undefined) : undefined,
        });
    };

    const selectAudience = (type: OrderAudienceType) => {
        trigger();
        setAudienceType(type);
        if (type === 'me') {
            if (isAdmin) {
                setSelectedParticipantIds([]);
                navigateToStep('participants');
            } else {
                setSelectedParticipantIds([currentUserId]);
                navigateToStep('items');
            }
        } else if (type === 'all') {
            setSelectedParticipantIds(groupMembers.map(m => m.id));
            navigateToStep('items');
        } else {
            setSelectedParticipantIds(currentUserId ? [currentUserId] : []);
            navigateToStep('participants');
        }
    };

    const itemsSubtitle = useCreateWizard || (flow === 'edit' && initialParticipantIds.length)
        ? getOrderAudienceSubtitle(
            selectedParticipantIds.length ? selectedParticipantIds : initialParticipantIds,
            groupMembers,
            currentUserId,
            audienceType || undefined
        )
        : undefined;

    const isSingleMemberPick = isAdmin && audienceType === 'me';

    const sheetTitle =
        step === 'audience' ? 'Este pedido é para…' :
            step === 'participants' ? (isSingleMemberPick ? 'Qual membro?' : 'Quem participa?') :
                title;

    const sheetSubtitle = step === 'items' ? itemsSubtitle : undefined;

    const handleBack = () => {
        if (step === 'items' && (audienceType === 'several' || (isAdmin && audienceType === 'me'))) {
            navigateToStep('participants');
        } else if (step === 'participants' || (step === 'items' && audienceType !== 'several' && !(isAdmin && audienceType === 'me'))) {
            setAudienceType(null);
            navigateToStep('audience');
        }
    };

    const showBackButton = useCreateWizard && (step === 'participants' || step === 'items');

    const sheetSize: SheetSize =
        step === 'participants' ? 'large' :
            step === 'items' ? 'large' :
                'medium';

    const supportsMinimize = useCreateWizard || flow === 'edit';

    const isDraftActive = useMemo(() => {
        if (!supportsMinimize) return false;

        if (flow === 'edit') {
            const itemsDirty =
                snapshotOrderItems(items) !== snapshotOrderItems(initialItems);
            const participantsDirty =
                normalizeParticipantIds(selectedParticipantIds) !==
                normalizeParticipantIds(initialParticipantIds);
            return itemsDirty || participantsDirty;
        }

        if (useCreateWizard) {
            if (audienceType !== null || step !== 'audience') return true;
            return items.some(
                (i) =>
                    i.name.trim() ||
                    (i.notes || '').trim() ||
                    (i.unit_price || 0) > 0 ||
                    isBrandSelected(i.brand)
            );
        }

        return items.some(
            (i) =>
                i.name.trim() ||
                (i.notes || '').trim() ||
                (i.unit_price || 0) > 0
        );
    }, [
        supportsMinimize,
        flow,
        useCreateWizard,
        items,
        initialItems,
        selectedParticipantIds,
        initialParticipantIds,
        audienceType,
        step,
    ]);

    const draftActiveRef = useRef(false);
    useEffect(() => {
        const next = isOpen ? isDraftActive : false;
        if (draftActiveRef.current === next) return;
        draftActiveRef.current = next;
        onDraftActiveChange?.(next);
    }, [isOpen, isDraftActive, onDraftActiveChange]);

    const minimizedSummary = useMemo(() => {
        if (!useCreateWizard) return null;
        if (step === 'audience') return 'A escolher para quem é o pedido';
        if (step === 'participants') {
            return isSingleMemberPick ? 'A escolher membro' : `${selectedParticipantIds.length} selecionado(s)`;
        }
        const count = items.filter(i => i.name.trim()).length;
        return count === 0 ? 'A adicionar produtos' : `${count} produto${count === 1 ? '' : 's'}`;
    }, [useCreateWizard, step, items, selectedParticipantIds.length, isSingleMemberPick]);

    // --- Search Logic ---

    const searchProducts = async (term?: string) => {
        if (!ENABLE_PRODUCT_SEARCH) return;
        const queryToUse = typeof term === 'string' ? term : searchQuery;
        if (!queryToUse.trim()) return;
        setSearchLoading(true);
        try {
            const response = await fetch(`https://supersave.pt/web/api/newLastStateCall.php?search=${encodeURIComponent(queryToUse)}`);
            const data = await response.json();
            setSearchResults(data.products?.slice(0, 8) || []);
        } catch (e) {
            console.error(e);
        } finally {
            setSearchLoading(false);
        }
    };

    // Prefetch product search once when the items step is shown with an empty new order
    useEffect(() => {
        if (!ENABLE_PRODUCT_SEARCH) return;
        if (!isOpen || step !== 'items' || mode !== 'multi' || hasAutoSearchedRef.current) return;
        if (initialItems.length > 0) return;
        hasAutoSearchedRef.current = true;
        searchProducts('Super Bock');
    }, [isOpen, step, mode, initialItems.length]);

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
        trigger('success');
        const p = getBestPrice(product);
        const newItem: ItemFormData = {
            name: product.name,
            quantity: 1,
            unit_price: p.price,
            brand: '', // Reset brand to empty/custom usually, or keep empty
            notes: product.marca,
            image_url: product.imageURL || '',
        };

        // If we are in single mode, replace the item
        if (mode === 'single') {
            setItems([newItem]);
        } else {
            setItems([...items, newItem]);
        }
    };

    // --- Render Helpers ---

    const StatusButton = ({ status, label, icon, currentStatus, onClick, color }: any) => (
        <button
            type="button"
            onClick={() => { trigger(); onClick(); }}
            className={cn(
                "flex flex-col items-center justify-center p-2 rounded-xl border-2 transition gap-1 flex-1",
                currentStatus === status
                    ? color + " border-current"
                    : "bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-400 dark:text-gray-500 hover:border-gray-200 dark:hover:border-slate-600"
            )}
        >
            <span className="material-icons text-lg">{icon}</span>
            <span className="text-[10px] font-bold uppercase">{label}</span>
        </button>
    );


    const AudienceCard = ({
        icon,
        label,
        onClick,
        className,
    }: {
        icon: string;
        label: string;
        onClick: () => void;
        className?: string;
    }) => (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-100 dark:border-slate-700',
                'bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 dark:hover:border-primary-600',
                'hover:bg-primary-50/50 dark:hover:bg-primary-900/20',
                'active:scale-[0.98] transition-[transform,background-color,border-color]',
                className
            )}
        >
            <span className="material-icons text-4xl text-primary-600 dark:text-primary-400">{icon}</span>
            <span className="font-bold text-gray-900 dark:text-gray-100">{label}</span>
        </button>
    );

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={sheetTitle}
            subtitle={sheetSubtitle}
            size={sheetSize}
            footerKey={step === 'audience' ? 'no-footer' : step}
            onBack={showBackButton ? handleBack : undefined}
            minimizable={supportsMinimize}
            draftActive={isDraftActive}
            minimized={minimized}
            onMinimize={onMinimize}
            onExpand={onExpand}
            onDiscard={onDiscard}
            minimizedSummary={minimizedSummary}
            discardConfirmMessage="Descartar este pedido? Perdes o que já preencheste."
            minimizedAboveBottomNav={minimizedAboveBottomNav}
            footer={
                step === 'audience' ? undefined : step === 'participants' ? (
                    <button
                        type="button"
                        disabled={selectedParticipantIds.length === 0}
                        onClick={() => { trigger(); navigateToStep('items'); }}
                        className="btn btn-primary w-full py-4 text-lg font-semibold shadow-lg shadow-violet-200/50 disabled:opacity-50"
                    >
                        {isSingleMemberPick ? 'Confirmar' : 'Continuar'}
                    </button>
                ) : (
                <div className={cn("flex gap-3", mode === 'single' ? "" : "w-full")}>
                    {mode === 'single' && isAdmin && onDelete && (
                        <button
                            type="button"
                            onClick={() => { trigger('error'); onDelete(); }}
                            className="flex-1 py-4 text-sm font-bold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                        >
                            Eliminar
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmit}
                        className={cn(
                            "btn btn-primary py-4 text-lg font-semibold shadow-lg shadow-violet-200/50",
                            mode === 'single' ? "flex-[2]" : "w-full"
                        )}
                    >
                        {submitting ? 'A guardar...' : submitLabel}
                    </button>
                </div>
                )
            }
        >
            <div className={cn(
                'flex flex-col flex-1 min-h-0 min-w-0',
                step === 'participants' && 'min-h-0'
            )}>
                <AnimatedStep
                    stepKey={step}
                    direction={stepDirection}
                    variant={step === 'audience' ? 'fade' : 'slide'}
                    className={cn(
                        'flex flex-col gap-6 pb-2 flex-1 min-h-0 overflow-visible',
                        step === 'participants' && 'flex-1 min-h-0'
                    )}
                >
                {step === 'audience' && useCreateWizard && (
                    <div className="grid grid-cols-2 gap-3">
                        <AudienceCard
                            icon="person"
                            label={isAdmin ? 'Um membro' : 'Eu'}
                            onClick={() => selectAudience('me')}
                        />
                        <AudienceCard icon="group" label="Vários" onClick={() => selectAudience('several')} />
                        <AudienceCard icon="groups" label="Todos" onClick={() => selectAudience('all')} className="col-span-2" />
                    </div>
                )}
                {step === 'participants' && useCreateWizard && (
                    <OrderParticipantsPicker
                        groupMembers={groupMembers}
                        selectedParticipantIds={selectedParticipantIds}
                        selectionMode={isSingleMemberPick ? 'single' : 'multi'}
                        onSelectedChange={setSelectedParticipantIds}
                    />
                )}
                {step === 'items' && (
                <>
                {/* Admin: legacy user combobox (only when wizard is off) */}
                {isAdmin && mode === 'multi' && !useCreateWizard && (
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
                            Para quem é este pedido?
                        </label>
                        <input
                            type="text"
                            value={userName}
                            onChange={(e) => {
                                setUserName(e.target.value);
                                setUserId('');
                                setComboboxOpen(true);
                            }}
                            onFocus={() => setComboboxOpen(true)}
                            placeholder="Selecione ou escreva um nome..."
                            className="input w-full pl-12 h-12 rounded-lg border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-900 transition-colors"
                        />
                        {comboboxOpen && userName.trim() && (() => {
                            const matches = users.filter(m =>
                                m.name.toLowerCase().includes(userName.toLowerCase())
                            );
                            return matches.length > 0 ? (
                                <ul className="mt-3 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-y-auto max-h-[min(40dvh,280px)] py-1">
                                    {matches.map((m) => (
                                        <li key={m.id}>
                                            <button
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => {
                                                    setUserName(m.name);
                                                    setUserId(m.id);
                                                    setComboboxOpen(false);
                                                }}
                                                className="w-full text-left px-4 py-3 hover:bg-primary-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-3"
                                            >
                                                <Avatar name={m.name} src={getUserAvatarUrl(m.id, m.avatar)} size="sm" />
                                                <span className="font-semibold text-gray-800 dark:text-gray-100">{m.name}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null;
                        })()}
                    </div>
                )}

                {/* Items List */}
                {items.map((item, i) => (
                    <div
                        key={i}
                        ref={(el) => {
                            itemCardRefs.current[i] = el;
                        }}
                        className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:border-primary-200 dark:focus-within:border-primary-800 focus-within:shadow-sm transition"
                    >
                        {mode === 'multi' && items.length > 1 && (
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                                    Produto {i + 1}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => { trigger('nudge'); removeItem(i); }}
                                    className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-red-500 hover:text-red-600 py-0.5 px-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    aria-label={`Remover produto ${i + 1}`}
                                >
                                    <span className="material-icons text-[14px]">close</span>
                                    Remover
                                </button>
                            </div>
                        )}

                        {/* Nome + quantidade */}
                        <div className="flex gap-3 mb-4">
                            <div className="flex-1 min-w-0">
                                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">
                                    O quê?
                                </label>
                                <input
                                    type="text"
                                    value={item.name}
                                    onChange={e => updateItem(i, 'name', e.target.value)}
                                    placeholder="ex. Leite, Bananas…"
                                    className="w-full px-4 py-3.5 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 rounded-xl font-medium text-base dark:text-gray-100 focus:outline-none focus:border-primary-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                    required
                                />
                            </div>
                            <div className="shrink-0 w-[88px]">
                                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 text-center">
                                    Qtd
                                </label>
                                <div className="flex items-center border-2 border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 h-[52px]">
                                    <button
                                        type="button"
                                        onClick={() => { trigger(); updateItem(i, 'quantity', Math.max(1, item.quantity - 1)); }}
                                        className="w-9 h-full flex items-center justify-center text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-l-xl touch-manipulation"
                                        aria-label="Menos"
                                    >
                                        <span className="material-icons text-lg">remove</span>
                                    </button>
                                    <span className="flex-1 text-center font-bold text-primary-600 dark:text-primary-400">
                                        {item.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { trigger(); updateItem(i, 'quantity', item.quantity + 1); }}
                                        className="w-9 h-full flex items-center justify-center text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-r-xl touch-manipulation"
                                        aria-label="Mais"
                                    >
                                        <span className="material-icons text-lg">add</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Marca — escolha principal */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">
                                Que marca?
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {BRAND_CHOICES.map(choice => {
                                    const selected = item.brand === choice.value;
                                    return (
                                        <button
                                            key={choice.value}
                                            type="button"
                                            onClick={() => { trigger(); updateItem(i, 'brand', choice.value); }}
                                            className={cn(
                                                'flex items-center justify-center text-center p-3 rounded-xl border-2 transition touch-manipulation min-h-[48px]',
                                                selected
                                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 shadow-sm'
                                                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-primary-300'
                                            )}
                                        >
                                            <span className={cn(
                                                'text-sm font-bold leading-tight',
                                                selected ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-gray-200'
                                            )}>
                                                {choice.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Notas — secundário */}
                        <div className="mb-3">
                            <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">
                                Outro detalhe? <span className="font-normal text-gray-500 dark:text-gray-400">(opcional)</span>
                            </label>
                            <textarea
                                value={item.notes}
                                onChange={e => updateItem(i, 'notes', e.target.value)}
                                placeholder="Ex: sem lactose, embalagem grande…"
                                rows={3}
                                className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 rounded-xl resize-none text-sm dark:text-gray-200 focus:outline-none focus:border-primary-500 placeholder:text-gray-400 whitespace-pre-wrap break-words"
                            />
                        </div>

                        {/* Preço — opcional / admin */}
                        {showPriceForItem(i, item) ? (
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 mb-1">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                                            Preço uni. (€)
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={item.unit_price || ''}
                                            onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                                            placeholder="0.00"
                                            className="w-full font-mono text-sm font-medium focus:outline-none dark:text-gray-200 bg-transparent"
                                        />
                                    </div>
                                    <div className="w-px h-10 bg-gray-100 dark:bg-slate-700" />
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Total</p>
                                        <p className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                                            {formatCurrency(item.quantity * item.unit_price)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    trigger();
                                    setPriceExpandedByIndex(prev => {
                                        const next = [...prev];
                                        next[i] = true;
                                        return next;
                                    });
                                }}
                                className="w-full py-2 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                            >
                                + Adicionar preço (opcional)
                            </button>
                        )}

                        {/* Row 4: Status (Only for Admin Single Mode) */}
                        {isAdmin && mode === 'single' && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Estado</label>
                                <div className="flex gap-2">
                                    <StatusButton
                                        status="pending"
                                        currentStatus={item.found_status}
                                        label="Por comprar"
                                        icon="hourglass_empty"
                                        color="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                                        onClick={() => updateItem(i, 'found_status', 'pending')}
                                    />
                                    <StatusButton
                                        status="found"
                                        currentStatus={item.found_status}
                                        label="Comprado"
                                        icon="check"
                                        color="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                        onClick={() => updateItem(i, 'found_status', 'found')}
                                    />
                                    <StatusButton
                                        status="not_available"
                                        currentStatus={item.found_status}
                                        label="Não tinha"
                                        icon="close"
                                        color="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                                        onClick={() => updateItem(i, 'found_status', 'not_available')}
                                    />
                                </div>
                            </div>
                        )}

                        {isAdmin && mode === 'single' && onMoveToOtherOrder && (
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={() => { trigger(); onMoveToOtherOrder(); }}
                                className="w-full py-3 text-sm font-bold text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 rounded-xl border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-lg">drive_file_move</span>
                                Mover para outro pedido
                            </button>
                            </div>
                        )}

                    </div>
                ))}

                {/* Add Item Button (Only in Multi Mode) */}
                {mode === 'multi' && (
                    <button
                        onClick={() => addEmptyItem()}
                        className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl text-gray-500 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 transition flex items-center justify-center gap-2 group"
                    >
                        <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs group-hover:scale-110 transition-transform">
                            <span className="material-icons text-sm">add</span>
                        </div>
                        Adicionar Outro Produto
                    </button>
                )}

                {/* Search Section */}
                {ENABLE_PRODUCT_SEARCH && (
                <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                        <span>🔍</span> Pesquisar Produtos
                    </h3>

                    <div className="relative mb-4">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchProducts())}
                            placeholder="Pesquisar (ex: Super Bock)..."
                            className="input w-full pl-12 pr-12 h-12 rounded-xl bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-primary-500 transition placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => searchProducts()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm flex items-center justify-center"
                            >
                                <span className="material-icons text-sm">arrow_forward</span>
                            </button>
                        )}
                    </div>

                    {searchLoading ? (
                        <div className="flex justify-center py-8"><LoadingSpinner size="md" /></div>
                    ) : searchResults.length > 0 && (
                        <div className="space-y-2">
                            {searchResults.map(p => {
                                const price = getBestPrice(p);
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => addFromSearch(p)}
                                        className="w-full p-2.5 bg-white dark:bg-slate-800 rounded-xl flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-700 transition text-left group"
                                    >
                                        <div className={cn("w-12 h-12 shrink-0 rounded-lg border border-gray-100 p-1 flex items-center justify-center overflow-hidden", p.imageURL ? "bg-white" : "bg-white dark:bg-slate-900 dark:border-slate-800")}>
                                            {p.imageURL ? (
                                                <img src={p.imageURL} alt={p.name} className="w-full h-full object-contain mix-blend-multiply" />
                                            ) : (
                                                <span className="text-xl opacity-30">🛒</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight mb-1 truncate">{p.name}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{p.marca}</span>
                                                {price.price > 0 && (
                                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                                        {formatCurrency(price.price)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-colors">
                                            <span className="material-icons text-sm">add</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                )}
                </>
                )}
                </AnimatedStep>
            </div>
        </Sheet>
    );
}
