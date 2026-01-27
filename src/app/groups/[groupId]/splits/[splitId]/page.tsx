'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { splitsApi, subscriptions } from '@/lib/pocketbase';
import type { Split } from '@/lib/types';
import { Header } from '@/components/layout/Header';
import { formatCurrency, cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';


interface EditableInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onBlur' | 'onChange' | 'onKeyDown'> {
    value: string | number;
    onSave: (value: string) => void;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

function EditableInput({ value: initialValue, onSave, className, ...props }: EditableInputProps) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const handleBlur = () => {
        if (String(value) !== String(initialValue)) {
            onSave(String(value));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
        if (props.onKeyDown) {
            props.onKeyDown(e);
        }
    };

    return (
        <input
            {...props}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={className}
        />
    );
}

import { useGroup } from '@/context/GroupContext';
import { useEditTimer } from '@/hooks/useEditTimer';

export default function GroupSplitDetailPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const splitId = params.splitId as string;
    const router = useRouter();
    const { user, isLoggedIn } = useUser();
    const { isAdmin } = useGroup();
    const { showToast } = useToast();
    const { startTimer } = useEditTimer();
    const shareRef = useRef<HTMLDivElement>(null);

    const [split, setSplit] = useState<Split | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newParticipant, setNewParticipant] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [showAddItem, setShowAddItem] = useState(false);
    const [participantsExpanded, setParticipantsExpanded] = useState(false);
    const [totalsExpanded, setTotalsExpanded] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    const loadSplit = useCallback(async () => {
        try {
            const data = await splitsApi.getById(splitId);
            setSplit(data);
        } catch (error) {
            console.error('Error loading split:', error);
            showToast('Erro ao carregar divisão', 'error');
        } finally {
            setLoading(false);
        }
    }, [splitId, showToast]);

    useEffect(() => {
        loadSplit();
        subscriptions.subscribeToSplits(() => loadSplit());
        return () => subscriptions.unsubscribeAll();
    }, [loadSplit]);

    const saveSplit = async (updatedFields: Partial<Split>) => {
        if (!split) return;

        // Deep clone for rollback safety
        const previousSplit = JSON.parse(JSON.stringify(split));

        // Optimistic update
        const newSplit = { ...split, ...updatedFields };
        setSplit(newSplit);

        // Debounce saving indicator for better UX on rapid typing
        if (!saving) setSaving(true);

        try {
            await splitsApi.update(splitId, updatedFields);
            // We don't overwrite with server response to avoid UI jumps while editing
        } catch (error) {
            console.error('Error saving split:', error);
            showToast('Erro ao guardar alteração', 'error');
            setSplit(previousSplit); // Rollback
        } finally {
            setSaving(false);
        }
    };

    const addParticipant = async () => {
        if (!split || !newParticipant.trim()) return;
        if (split.participants.includes(newParticipant.trim())) {
            showToast('Já existe', 'error');
            return;
        }
        await saveSplit({ participants: [...split.participants, newParticipant.trim()] });
        setNewParticipant('');
    };

    const removeParticipant = async (name: string) => {
        if (!split || split.participants.length <= 1) return;
        if (!confirm(`Remover ${name}?`)) return;

        const updatedItems = split.items.map(item => ({
            ...item,
            participants: item.participants.filter(p => p !== name),
        }));

        await saveSplit({
            participants: split.participants.filter(p => p !== name),
            items: updatedItems
        });
    };

    const updateParticipantName = async (oldName: string, newName: string) => {
        if (!split || !newName.trim() || oldName === newName.trim()) return;
        if (split.participants.includes(newName.trim())) {
            showToast('Nome já existe', 'error');
            return;
        }
        const updatedParticipants = split.participants.map(p => p === oldName ? newName.trim() : p);
        const updatedItems = split.items.map(item => ({
            ...item,
            participants: item.participants.map(p => p === oldName ? newName.trim() : p),
        }));
        await saveSplit({ participants: updatedParticipants, items: updatedItems });
    };

    const addItem = async () => {
        if (!split) return;
        await saveSplit({ items: [...split.items, { name: '', price: 0, participants: [] }] });
    };

    const removeItem = async (idx: number) => {
        if (!split) return;
        const newItems = split.items.filter((_, i) => i !== idx);
        await saveSplit({ items: newItems });
    };

    const toggleParticipant = async (itemIdx: number, participant: string) => {
        if (!split) return;

        // Deep clone items to avoid mutation issues
        const items = split.items.map(item => ({ ...item, participants: [...item.participants] }));
        const item = items[itemIdx];

        if (item.participants.includes(participant)) {
            item.participants = item.participants.filter(p => p !== participant);
        } else {
            item.participants = [...item.participants, participant];
        }

        await saveSplit({ items });
    };

    const toggleAllParticipants = async (itemIdx: number, checked: boolean) => {
        if (!split) return;
        const items = split.items.map(item => ({ ...item, participants: [...item.participants] }));
        items[itemIdx].participants = checked ? [...split.participants] : [];
        await saveSplit({ items });
    };

    const updateItemName = async (idx: number, name: string) => {
        if (!split) return;
        const items = split.items.map(item => ({ ...item, participants: [...item.participants] }));
        items[idx].name = name;
        await saveSplit({ items });
    };

    const updateItemPrice = async (idx: number, price: number) => {
        if (!split) return;
        const items = split.items.map(item => ({ ...item, participants: [...item.participants] }));
        items[idx].price = price;
        await saveSplit({ items });
    };

    // Calculate totals
    const calculateTotals = () => {
        if (!split) return {};
        const totals: Record<string, number> = {};
        split.participants.forEach(p => totals[p] = 0);
        split.items.forEach(item => {
            if (item.participants.length > 0) {
                const share = item.price / item.participants.length;
                item.participants.forEach(p => {
                    if (totals[p] !== undefined) totals[p] += share;
                });
            }
        });
        return totals;
    };

    const totals = calculateTotals();
    const grandTotal = split?.items.reduce((sum, item) => sum + item.price, 0) || 0;

    // Share
    const handleShare = async () => {
        if (!split || !shareRef.current) return;
        setSharing(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(shareRef.current, { backgroundColor: '#ffffff', scale: 2 });
            const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
            const file = new File([blob], `${split.name}.png`, { type: 'image/png' });
            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: split.name, files: [file] });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${split.name}.png`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Imagem guardada!', 'success');
            }
        } catch (error) {
            if ((error as Error).name !== 'AbortError') showToast('Erro ao partilhar', 'error');
        } finally {
            setSharing(false);
        }
    };

    const deleteSplit = async () => {
        if (!confirm('Eliminar esta divisão?')) return;
        try {
            await splitsApi.delete(splitId);
            showToast('Divisão eliminada', 'success');
            router.push(`/groups/${groupId}/splits`);
        } catch {
            showToast('Erro ao eliminar', 'error');
        }
    };

    if (!isLoggedIn) return null;
    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)]">
                <Header showBack title="Divisor" groupId={groupId} />
                <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
            </div>
        );
    }

    if (!split) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)]">
                <Header showBack title="Divisor" groupId={groupId} />
                <div className="text-center py-20">
                    <div className="text-5xl mb-4">🔍</div>
                    <h2 className="text-xl font-bold mb-2">Divisão não encontrada</h2>
                    <button onClick={() => router.push(`/groups/${groupId}/splits`)} className="btn btn-primary px-6 py-2 mt-4">Voltar</button>
                </div>
            </div>
        );
    }

    const sortedTotals = Object.entries(totals).sort(([, a], [, b]) => b - a);

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-32 md:pb-8">
            <Header showBack title={split.name} subtitle={split.description || 'Divisão'} groupId={groupId} />

            {saving && (
                <div className="fixed top-20 right-4 z-50 bg-violet-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-lg">
                    <LoadingSpinner size="sm" /> A guardar...
                </div>
            )}

            {/* Desktop Layout */}
            <div className="hidden lg:block w-full px-4 md:px-8 py-6">
                <div className="mx-auto max-w-[99%]">
                    {/* Header with actions */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <EditableInput
                                type="text"
                                value={split.name}
                                onSave={val => saveSplit({ name: val })}
                                className="text-2xl font-bold bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded-lg px-2 py-1 text-[var(--text-primary)] w-full"
                            />
                            <EditableInput
                                type="text"
                                value={split.description}
                                onSave={val => saveSplit({ description: val })}
                                placeholder="Descrição (opcional)"
                                className="block text-sm text-[var(--text-muted)] bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded-lg px-2 py-1 w-full max-w-md"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleShare} disabled={sharing} className="btn btn-primary px-4 py-2 flex items-center gap-2">
                                {sharing ? <LoadingSpinner size="sm" /> : '📤'} Partilhar
                            </button>
                            <button onClick={deleteSplit} className="btn bg-red-500 hover:bg-red-600 text-white px-4 py-2">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </div>

                    {/* Desktop Table Container */}
                    <div className="card shadow-xl overflow-hidden w-full border-[var(--border)]">
                        <div className="overflow-x-auto overflow-y-auto w-full max-h-[calc(100vh-220px)] border-collapse px-0.5">
                            <table className="w-full text-sm">
                                <thead className="bg-gradient-to-r from-violet-600 to-purple-600 text-white sticky top-0 z-30">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold min-w-[200px]">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setIsFullscreen(true)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Ecrã Inteiro">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                                </button>
                                                <span>Item</span>
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-right font-semibold min-w-[100px]">Preço</th>
                                        <th className="px-4 py-3 text-center font-semibold min-w-[60px]">Todos</th>
                                        {split.participants.map((p, idx) => (
                                            <th key={idx} className="px-3 py-3 text-center font-semibold min-w-[100px] relative group">
                                                <div className="flex flex-col items-center">
                                                    <Avatar name={p} size="sm" className="mb-1" />
                                                    <EditableInput
                                                        type="text"
                                                        value={p}
                                                        onSave={val => updateParticipantName(p, val)}
                                                        className="w-full text-center bg-transparent border-0 focus:outline-none focus:bg-white/20 rounded px-1 text-xs font-medium"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => removeParticipant(p)}
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                                >×</button>
                                            </th>
                                        ))}
                                        <th className="px-3 py-3 text-center min-w-[80px]">
                                            <button onClick={() => {
                                                const name = prompt('Nome do participante:');
                                                if (name) {
                                                    if (!split.participants.includes(name.trim())) {
                                                        saveSplit({ participants: [...split.participants, name.trim()] });
                                                    }
                                                }
                                            }} className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center mx-auto transition-colors">
                                                <span className="text-lg">+</span>
                                            </button>
                                        </th>
                                        <th className="px-4 py-3 text-right font-semibold min-w-[140px]">
                                            <div className="flex items-center justify-end gap-2">
                                                <span>Por Pessoa</span>
                                                <button onClick={() => setIsFullscreen(true)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Ecrã Inteiro">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                                </button>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {split.items.map((item, idx) => {
                                        const perPerson = item.participants.length > 0 ? item.price / item.participants.length : 0;
                                        const allSelected = item.participants.length === split.participants.length && split.participants.length > 0;
                                        return (
                                            <tr key={idx} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                                                <td className="px-4 py-3">
                                                    <EditableInput
                                                        type="text"
                                                        value={item.name}
                                                        onSave={val => updateItemName(idx, val)}
                                                        placeholder="Nome do item"
                                                        className="w-full px-2 py-1 border border-transparent hover:border-[var(--border)] focus:border-violet-500 rounded-lg bg-transparent focus:bg-white transition-all"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <EditableInput
                                                            type="number"
                                                            min={0}
                                                            step={0.01}
                                                            value={item.price || ''}
                                                            onSave={val => updateItemPrice(idx, parseFloat(val) || 0)}
                                                            placeholder="0.00"
                                                            className="w-20 px-2 py-1 border border-transparent hover:border-[var(--border)] focus:border-violet-500 rounded-lg bg-transparent text-right focus:bg-white transition-all"
                                                        />
                                                        <span className="text-[var(--text-muted)]">€</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        onChange={e => toggleAllParticipants(idx, e.target.checked)}
                                                        className="w-5 h-5 rounded border-2 border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                                    />
                                                </td>
                                                {split.participants.map(p => (
                                                    <td key={p} className="px-3 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={item.participants.includes(p)}
                                                            onChange={() => toggleParticipant(idx, p)}
                                                            className="w-5 h-5 rounded border-2 border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-3 py-3 text-center">
                                                    <button onClick={() => removeItem(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors">
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-violet-600">
                                                    {formatCurrency(perPerson)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Add item row */}
                                    <tr className="bg-[var(--bg-tertiary)]">
                                        <td colSpan={5 + split.participants.length} className="px-4 py-3">
                                            <button onClick={addItem} className="flex items-center gap-2 text-violet-600 hover:underline font-medium">
                                                <span className="text-lg">+</span> Adicionar Item
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                                <tfoot className="bg-gradient-to-r from-violet-700 to-purple-700 text-white sticky bottom-0 z-30">
                                    <tr>
                                        <td className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Total Cada</td>
                                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(grandTotal)}</td>
                                        <td className="px-4 py-3"></td>
                                        {split.participants.map(p => (
                                            <td key={p} className="px-3 py-3 text-center font-bold">
                                                {formatCurrency(totals[p] || 0)}
                                            </td>
                                        ))}
                                        <td className="px-3 py-3"></td>
                                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(grandTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Layout */}
            <main className="lg:hidden container mx-auto px-4 py-4 max-w-2xl">
                {/* Collapsible Participants */}
                <section className="card mb-4">
                    <button onClick={() => setParticipantsExpanded(!participantsExpanded)} className="w-full p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">Participantes</span>
                            <span className="text-sm bg-[var(--bg-tertiary)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{split.participants.length}</span>
                        </div>
                        <svg className={cn("w-5 h-5 text-[var(--text-muted)] transition-transform", participantsExpanded && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {participantsExpanded && (
                        <div className="px-4 pb-4 border-t border-[var(--border)]">
                            <div className="flex flex-wrap gap-2 py-3">
                                {split.participants.map(p => (
                                    <div key={p} className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] rounded-full px-2.5 py-1 text-sm">
                                        <Avatar name={p} size="xs" />
                                        <span className="font-medium">{p}</span>
                                        <button onClick={() => removeParticipant(p)} className="text-[var(--text-muted)] hover:text-red-500 ml-1">×</button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={newParticipant} onChange={e => setNewParticipant(e.target.value)} onKeyDown={e => e.key === 'Enter' && addParticipant()} placeholder="Nome" className="input flex-1 py-2 text-sm" />
                                <button onClick={addParticipant} className="btn btn-primary px-3 py-2 text-sm">+</button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Items */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="font-semibold text-[var(--text-primary)]">Itens</span>
                    <span className="text-sm text-[var(--text-muted)]">{split.items.length}</span>
                </div>

                <div className="space-y-3">
                    {split.items.map((item, idx) => {
                        const perPerson = item.participants.length > 0 ? item.price / item.participants.length : 0;
                        return (
                            <div key={idx} className="card p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <EditableInput type="text" value={item.name} onSave={val => updateItemName(idx, val)} placeholder="Nome do item" className="flex-1 px-3 py-2 border-2 border-[var(--border)] rounded-lg font-medium bg-[var(--bg-secondary)]" />
                                    <button onClick={() => removeItem(idx)} className="p-2 text-red-500">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                    </button>
                                </div>
                                <div className="mb-2">
                                    <label className="text-xs text-[var(--text-muted)] mb-1 block">Preço</label>
                                    <div className="flex items-center gap-1">
                                        <EditableInput type="number" min={0} step={0.01} value={item.price || ''} onSave={val => updateItemPrice(idx, parseFloat(val) || 0)} className="flex-1 px-3 py-2 border-2 border-[var(--border)] rounded-lg text-right bg-[var(--bg-secondary)]" />
                                        <span className="text-[var(--text-muted)]">€</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-[var(--text-muted)] mb-1.5 block">Participantes</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {split.participants.map(p => (
                                            <button key={p} onClick={() => toggleParticipant(idx, p)} className={cn('flex items-center gap-1 px-2 py-1 rounded text-sm font-medium transition-all', item.participants.includes(p) ? 'bg-violet-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]')}>
                                                <span className={cn('w-4 h-4 rounded border-2 flex items-center justify-center text-xs', item.participants.includes(p) ? 'border-white bg-white text-violet-500' : 'border-[var(--text-muted)]')}>
                                                    {item.participants.includes(p) && '✓'}
                                                </span>
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {item.participants.length > 0 && (
                                    <div className="text-right mt-2 text-sm">
                                        <span className="text-[var(--text-muted)]">Por pessoa: </span>
                                        <span className="font-semibold text-violet-600">{formatCurrency(perPerson)}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <button onClick={addItem} className="w-full p-4 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:border-violet-400 hover:text-violet-600 transition-all flex items-center justify-center gap-2">
                        + Adicionar Item
                    </button>
                </div>
            </main>

            {/* Mobile Bottom Totals */}
            <div className={cn(
                "lg:hidden fixed left-0 right-0 bg-[var(--bg-secondary)] border-t border-[var(--border)] shadow-lg z-40",
                isAdmin ? "bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom))]" : "bottom-[var(--safe-bottom)]"
            )}>
                <button onClick={() => setTotalsExpanded(!totalsExpanded)} className="w-full px-4 py-3 flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">Total</span>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{formatCurrency(grandTotal)}</span>
                        <svg className={cn("w-5 h-5 text-[var(--text-muted)] transition-transform", totalsExpanded && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </div>
                </button>
                {totalsExpanded && (
                    <div className="px-4 pb-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
                        <div className="py-2 text-sm space-y-1">
                            {sortedTotals.map(([name, amount]) => (
                                <div key={name} className="flex justify-between">
                                    <span className="text-[var(--text-secondary)]">{name}</span>
                                    <span className="font-medium text-violet-600 dark:text-violet-400">{formatCurrency(amount)}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={handleShare} disabled={sharing} className="w-full mt-2 btn btn-primary py-2 text-sm flex items-center justify-center gap-2">
                            {sharing ? <LoadingSpinner size="sm" /> : '📤'} Partilhar Imagem
                        </button>
                    </div>
                )}
            </div>

            {/* Hidden share image */}
            <div className="fixed -left-[9999px] top-0">
                <div ref={shareRef} style={{ width: 400, backgroundColor: '#ffffff', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>💰 {split.name}</h2>
                    <p style={{ color: '#6b7280', marginBottom: 16 }}>{split.description || 'Divisão de despesas'}</p>
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ color: '#4b5563', fontWeight: 500 }}>Total</span>
                            <span style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(grandTotal)}</span>
                        </div>
                    </div>
                    <div>
                        {sortedTotals.map(([name, amount]) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                                <span style={{ color: '#374151' }}>{name}</span>
                                <span style={{ fontWeight: 600, color: '#7c3aed' }}>{formatCurrency(amount)}</span>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, textAlign: 'center' }}>Gerado por Order It All!</p>
                </div>
            </div>
            {/* Fullscreen Table Modal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-[100] bg-[var(--bg-primary)] flex flex-col animate-in fade-in duration-200">
                    <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-white shadow-sm">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📊</span>
                            <div>
                                <h2 className="font-bold text-[var(--text-primary)] text-lg">{split.name}</h2>
                                <p className="text-xs text-[var(--text-muted)]">Modo Ecrã Inteiro</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                            title="Fechar"
                        >
                            <svg className="w-8 h-8 text-gray-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-hidden bg-white">
                        <div className="h-full overflow-hidden flex flex-col">
                            <div className="overflow-x-auto overflow-y-auto flex-1 px-0.5">
                                <table className="w-full text-sm border-collapse">
                                    <thead className="bg-gradient-to-r from-violet-600 to-purple-600 text-white sticky top-0 z-30">
                                        <tr>
                                            <th className="px-6 py-4 text-left font-bold text-base min-w-[200px]">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setIsFullscreen(false)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Sair do Ecrã Inteiro">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                                    </button>
                                                    <span>Item</span>
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-right font-semibold min-w-[120px]">Preço</th>
                                            <th className="px-6 py-4 text-center font-semibold min-w-[80px]">Todos</th>
                                            {split.participants.map((p, idx) => (
                                                <th key={idx} className="px-4 py-4 text-center font-semibold min-w-[120px]">
                                                    <div className="flex flex-col items-center">
                                                        <Avatar name={p} size="sm" className="mb-1" />
                                                        <span className="text-xs font-medium">{p}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-4 py-4 text-center min-w-[80px]">
                                                <button onClick={() => {
                                                    const name = prompt('Nome do participante:');
                                                    if (name) {
                                                        if (!split.participants.includes(name.trim())) {
                                                            saveSplit({ participants: [...split.participants, name.trim()] });
                                                        }
                                                    }
                                                }} className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center mx-auto transition-colors">
                                                    <span className="text-lg">+</span>
                                                </button>
                                            </th>
                                            <th className="px-6 py-4 text-right font-semibold min-w-[150px]">Por Pessoa</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)] bg-white">
                                        {split.items.map((item, idx) => {
                                            const perPerson = item.participants.length > 0 ? item.price / item.participants.length : 0;
                                            const allSelected = item.participants.length === split.participants.length && split.participants.length > 0;
                                            return (
                                                <tr key={idx} className="hover:bg-violet-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <EditableInput
                                                            type="text"
                                                            value={item.name}
                                                            onSave={val => updateItemName(idx, val)}
                                                            placeholder="Nome do item"
                                                            className="w-full px-3 py-2 border border-transparent hover:border-violet-200 focus:border-violet-500 rounded-lg bg-transparent focus:bg-white font-medium"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <EditableInput
                                                                type="number"
                                                                min={0}
                                                                step={0.01}
                                                                value={item.price || ''}
                                                                onSave={val => updateItemPrice(idx, parseFloat(val) || 0)}
                                                                placeholder="0.00"
                                                                className="w-24 px-3 py-2 border border-transparent hover:border-violet-200 focus:border-violet-500 rounded-lg bg-transparent text-right focus:bg-white"
                                                            />
                                                            <span className="text-gray-400">€</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={allSelected}
                                                            onChange={e => toggleAllParticipants(idx, e.target.checked)}
                                                            className="w-6 h-6 rounded border-2 border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    {split.participants.map(p => (
                                                        <td key={p} className="px-4 py-4 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={item.participants.includes(p)}
                                                                onChange={() => toggleParticipant(idx, p)}
                                                                className="w-6 h-6 rounded border-2 border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                                            />
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-4 text-center">
                                                        <button onClick={() => removeItem(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors">
                                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-violet-600 text-lg">
                                                        {formatCurrency(perPerson)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-[var(--bg-tertiary)]">
                                            <td colSpan={5 + split.participants.length} className="px-6 py-4">
                                                <button onClick={addItem} className="flex items-center gap-2 text-violet-600 hover:underline font-medium">
                                                    <span className="text-lg">+</span> Adicionar Item
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-gradient-to-r from-violet-700 to-purple-700 text-white sticky bottom-0 z-30">
                                        <tr>
                                            <td className="px-6 py-5 font-bold uppercase text-sm tracking-wider">Total Geral</td>
                                            <td className="px-6 py-5 text-right font-black text-xl">{formatCurrency(grandTotal)}</td>
                                            <td className="px-6 py-5"></td>
                                            {split.participants.map(p => (
                                                <td key={p} className="px-4 py-5 text-center font-black text-lg">
                                                    {formatCurrency(totals[p] || 0)}
                                                </td>
                                            ))}
                                            <td className="px-4 py-5"></td>
                                            <td className="px-6 py-5 text-right font-black text-xl">{formatCurrency(grandTotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
