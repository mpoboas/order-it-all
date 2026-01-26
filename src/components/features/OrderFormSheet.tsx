import { useState, useEffect } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { formatCurrency, cn } from '@/lib/utils';
import { Item } from '@/lib/types';

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
    onSubmit: (data: { items: ItemFormData[], userId?: string, userName?: string }) => Promise<void>;
    onDelete?: () => Promise<void>; // For single item delete
    initialItems?: ItemFormData[];
    title: string;
    submitLabel: string;
    submitting: boolean;
    mode?: 'multi' | 'single';
    isAdmin?: boolean;
    users?: any[]; // For admin user selection
    initialUser?: { name: string, id: string };
}

const DEFAULT_ITEMS: ItemFormData[] = [];
const DEFAULT_USERS: any[] = [];

export function OrderFormSheet({
    isOpen,
    onClose,
    onSubmit,
    onDelete,
    initialItems = DEFAULT_ITEMS,
    title,
    submitLabel,
    submitting,
    mode = 'multi',
    isAdmin = false,
    users = DEFAULT_USERS,
    initialUser
}: OrderFormSheetProps) {
    // Form State
    const [items, setItems] = useState<ItemFormData[]>([{ name: '', quantity: 1, unit_price: 0, brand: 'Official', notes: '', image_url: '' }]);
    const [userId, setUserId] = useState('');
    const [userName, setUserName] = useState('');
    const [comboboxOpen, setComboboxOpen] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialItems.length > 0) {
                setItems(initialItems.map(i => ({
                    ...i,
                    // Ensure defaults
                    quantity: i.quantity || 1,
                    unit_price: i.unit_price || 0,
                    brand: i.brand || 'Official',
                    notes: i.notes || '',
                    image_url: i.image_url || '',
                    found_status: i.found_status || 'pending'
                })));
            } else {
                setItems([{ name: '', quantity: 1, unit_price: 0, brand: 'Official', notes: '', image_url: '' }]);
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

            if (mode === 'multi' && initialItems.length === 0) {
                searchProducts("Super Bock");
            }
        }
    }, [isOpen, initialItems, initialUser, mode]);

    // --- Actions ---

    const updateItem = (index: number, field: keyof ItemFormData, value: any) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const addEmptyItem = () => {
        setItems([...items, { name: '', quantity: 1, unit_price: 0, brand: 'Official', notes: '', image_url: '' }]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const validItems = items.filter(i => i.name.trim());
        if (validItems.length === 0) return; // Should show toast, but keeping it simple for now, parent handles validation usually
        onSubmit({ items: validItems, userId, userName });
    };

    // --- Search Logic ---

    const searchProducts = async (term?: string) => {
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
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all gap-1 flex-1",
                currentStatus === status
                    ? color + " border-current"
                    : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
            )}
        >
            <span className="material-icons text-lg">{icon}</span>
            <span className="text-[10px] font-bold uppercase">{label}</span>
        </button>
    );

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            footer={
                <div className={cn("flex gap-3", mode === 'single' ? "" : "w-full")}>
                    {mode === 'single' && isAdmin && onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
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
            }
        >
            <div className="space-y-6 pb-4">
                {/* Admin: User Selection (Only in Multi/Create Mode) */}
                {isAdmin && mode === 'multi' && (
                    <div className="relative z-20">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">Para quem é este pedido?</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={userName}
                                onChange={(e) => {
                                    setUserName(e.target.value);
                                    setUserId('');
                                    setComboboxOpen(true);
                                }}
                                onFocus={() => setComboboxOpen(true)}
                                onBlur={() => setTimeout(() => setComboboxOpen(false), 200)}
                                placeholder="Selecione ou escreva um nome..."
                                className="input w-full pl-12 h-12 rounded-xl border-gray-200 bg-gray-50 focus:bg-white transition-colors"
                            />
                            {comboboxOpen && users.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-60 overflow-y-auto py-2 z-50">
                                    {users.filter(m => m.name.toLowerCase().includes(userName.toLowerCase())).map((m: any) => (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                setUserName(m.name);
                                                setUserId(m.id);
                                                setComboboxOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex items-center gap-3"
                                        >
                                            <Avatar name={m.name} src={m.avatar ? `https://pb-orderit.povoas.top/api/files/users/${m.id}/${m.avatar}` : undefined} size="sm" />
                                            <div>
                                                <div className="font-semibold text-gray-800">{m.name}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Items List */}
                {items.map((item, i) => (
                    <div key={i} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 focus-within:bg-white focus-within:border-violet-200 focus-within:shadow-sm transition-all">
                        {/* Row 1: Name + Quantity */}
                        <div className="flex gap-3 mb-3">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Produto</label>
                                <input
                                    type="text"
                                    value={item.name}
                                    onChange={e => updateItem(i, 'name', e.target.value)}
                                    placeholder="ex. Bananas"
                                    className="input w-full font-medium"
                                    required
                                />
                            </div>
                            <div className="w-20">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Qtd</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
                                    className="input w-full text-center font-bold text-violet-600"
                                />
                            </div>
                        </div>

                        {/* Row 2: Price + Total */}
                        <div className="bg-white rounded-xl p-3 border border-gray-100 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Preço Uni. (€)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={item.unit_price || ''}
                                            onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                                            placeholder="0.00"
                                            className="w-full bg-transparent font-mono text-sm font-medium focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="w-px h-8 bg-gray-100" />
                                <div className="flex-1 text-right">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Total</label>
                                    <span className="font-mono text-sm font-bold text-gray-900">
                                        {formatCurrency(item.quantity * item.unit_price)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Brand & Notes */}
                        <div className="space-y-3">
                            <div>
                                <div className="flex p-1 bg-gray-100 rounded-lg">
                                    {['Official', 'Off-brand'].map((brandOption) => (
                                        <button
                                            key={brandOption}
                                            type="button"
                                            onClick={() => updateItem(i, 'brand', brandOption as any)}
                                            className={cn(
                                                "flex-1 py-1.5 text-xs font-bold rounded-md transition-all",
                                                item.brand === brandOption
                                                    ? "bg-white text-violet-600 shadow-sm"
                                                    : "text-gray-500 hover:text-gray-700"
                                            )}
                                        >
                                            {brandOption === 'Official' ? 'Original' : 'Branca'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <textarea
                                value={item.notes}
                                onChange={e => updateItem(i, 'notes', e.target.value)}
                                placeholder="Notas (opcional)..."
                                rows={1}
                                className="input w-full resize-none text-sm py-2 min-h-[42px]"
                            />
                        </div>

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
                                        color="bg-amber-100 text-amber-700 border-amber-200"
                                        onClick={() => updateItem(i, 'found_status', 'pending')}
                                    />
                                    <StatusButton
                                        status="found"
                                        currentStatus={item.found_status}
                                        label="Comprado"
                                        icon="check"
                                        color="bg-emerald-100 text-emerald-700 border-emerald-200"
                                        onClick={() => updateItem(i, 'found_status', 'found')}
                                    />
                                    <StatusButton
                                        status="not_available"
                                        currentStatus={item.found_status}
                                        label="Em falta"
                                        icon="close"
                                        color="bg-red-100 text-red-700 border-red-200"
                                        onClick={() => updateItem(i, 'found_status', 'not_available')}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Remove button (Only if multi mode and > 1 item) */}
                        {mode === 'multi' && items.length > 1 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => removeItem(i)}
                                    className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                    <span className="material-icons text-sm">delete</span>
                                    Remover
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                {/* Add Item Button (Only in Multi Mode) */}
                {mode === 'multi' && (
                    <button
                        type="button"
                        onClick={addEmptyItem}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 font-bold hover:bg-gray-50 hover:border-violet-300 hover:text-violet-600 transition-all flex items-center justify-center gap-2 group"
                    >
                        <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs group-hover:scale-110 transition-transform">
                            <span className="material-icons text-sm">add</span>
                        </div>
                        Adicionar Outro Produto
                    </button>
                )}

                {/* Search Section */}
                <div className="pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span>🔍</span> Pesquisar Produtos
                    </h3>

                    <div className="relative mb-4">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchProducts())}
                            placeholder="Pesquisar (ex: Super Bock)..."
                            className="input w-full pl-12 pr-12 h-12 rounded-xl bg-gray-50 border-transparent focus:bg-white focus:border-violet-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => searchProducts()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors shadow-sm flex items-center justify-center"
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
                                        className="w-full p-2.5 bg-white rounded-xl flex items-center gap-3 hover:bg-gray-50 border border-gray-100 transition-all text-left group"
                                    >
                                        <div className="w-12 h-12 shrink-0 rounded-lg bg-white border border-gray-100 p-1 flex items-center justify-center">
                                            {p.imageURL ? (
                                                <img src={p.imageURL} alt={p.name} className="w-full h-full object-contain mix-blend-multiply" />
                                            ) : (
                                                <span className="text-xl opacity-30">🛒</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 text-sm leading-tight mb-1 truncate">{p.name}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{p.marca}</span>
                                                {price.price > 0 && (
                                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                                        {formatCurrency(price.price)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors">
                                            <span className="material-icons text-sm">add</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Sheet>
    );
}
