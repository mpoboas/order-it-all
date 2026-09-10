'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { splitsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { useSplit } from '@/lib/db/hooks';
import { optimisticDelete, mutationErrorMessage } from '@/lib/db/mutations';
import { navStart } from '@/lib/navProgress';
import type { Split, SplitItem } from '@/lib/types';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
const SplitShareSheet = dynamic(
    () => import('@/components/features/SplitShareSheet').then((m) => m.SplitShareSheet),
    { ssr: false }
);
const SplitAllowedModesSheet = dynamic(
    () => import('@/components/features/SplitAllowedModesSheet').then((m) => m.SplitAllowedModesSheet),
    { ssr: false }
);
const SplitInvoiceScanSheet = dynamic(
    () => import('@/components/features/SplitInvoiceScanSheet').then((m) => m.SplitInvoiceScanSheet),
    { ssr: false }
);
import { SplitMemberDetailView } from '@/components/features/SplitMemberDetailView';
import { SplitParticipantNameInput } from '@/components/features/SplitParticipantNameInput';
import { SplitItemAllocationSheet } from '@/components/features/SplitItemAllocationSheet';
import {
    computeParticipantAmount,
    getActiveParticipants,
    getItemModeShortLabel,
    getSplitItemMode,
    removeParticipantFromItem,
    renameParticipantInItem,
} from '@/lib/splitItemAllocation';
import {
    calculateSplitTotals,
    getParticipantAvatarUrl,
    getStoredParticipantsExpanded,
    listGroupMembersNotInParticipants,
    setStoredParticipantsExpanded,
} from '@/lib/splitShare';
import {
    cloneSplitItems,
    getRemoveItemConfirmMessage,
    isItemLocked,
    reconcileItemLock,
    reconcileSplitItems,
    setItemLocked,
    shouldConfirmRemoveItem,
} from '@/lib/splitItems';
import {
    closeSplitPayload,
    isSplitClosed,
    normalizeSplitRecord,
    openSplitPayload,
} from '@/lib/splitStatus';
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
import { Icon } from '@/components/ui/Icon';

export default function GroupSplitDetailPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const splitId = params.splitId as string;
    const router = useTransitionRouter();
    const { user, isLoggedIn, updateProfile } = useUser();
    const { currentGroup, isAdmin } = useGroup();
    const { showToast } = useToast();
    const { startTimer } = useEditTimer();
    const shareRef = useRef<HTMLDivElement>(null);
    const participantInputDesktopRef = useRef<HTMLInputElement>(null);
    const participantInputMobileRef = useRef<HTMLInputElement>(null);

    const [split, setSplit] = useState<Split | null>(null);
    const [saving, setSaving] = useState(false);
    const liveSplit = useSplit(splitId);
    /** Fila de gravações — serializa `saveSplit` para os writes de `items` não
     *  colidirem entre si na versão. */
    const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
    /** Versão de `items` mais fresca conhecida (realtime + respostas de save). */
    const itemsVersionRef = useRef<number | null>(null);
    // `liveSplit` já trouxe dados mas o `setSplit` do efeito ainda não correu
    // (lag de 1 render) → continua em loading, senão "Divisão não encontrada"
    // pisca por um frame. Só quando a query resolve mesmo a `null` é que caímos
    // no ecrã de não-encontrada.
    const loading =
        liveSplit === undefined || (split === null && liveSplit !== null);
    const [newParticipant, setNewParticipant] = useState('');
    const [participantsExpanded, setParticipantsExpanded] = useState(true);
    const [totalsExpanded, setTotalsExpanded] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [showInviteSheet, setShowInviteSheet] = useState(false);
    const [showAllowedModesSheet, setShowAllowedModesSheet] = useState(false);
    const [showScanSheet, setShowScanSheet] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [allocationSheetIdx, setAllocationSheetIdx] = useState<number | null>(null);

    const participantAvatar = useCallback(
        (name: string) => getParticipantAvatarUrl(name, currentGroup),
        [currentGroup]
    );

    const groupMembersToAdd = useMemo(
        () => listGroupMembersNotInParticipants(currentGroup, split?.participants ?? []),
        [currentGroup, split?.participants]
    );

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    useEffect(() => {
        setParticipantsExpanded(getStoredParticipantsExpanded(true));
    }, []);

    const toggleParticipantsExpanded = () => {
        setParticipantsExpanded((prev) => {
            const next = !prev;
            setStoredParticipantsExpanded(next);
            return next;
        });
    };

    const splitRef = useRef<Split | null>(null);
    splitRef.current = split;

    // A cache local (Dexie) é a fonte da verdade. Mantém-se o `split` em estado
    // local para as edições in-place não "saltarem". Não recua: se a cache ainda
    // não recebeu a nossa última gravação de `items`, espera (evita o "flash").
    useEffect(() => {
        if (liveSplit === undefined) return;
        const liveV = liveSplit?.items_version;
        if (typeof liveV === 'number') {
            if (liveV >= (itemsVersionRef.current ?? 0)) {
                itemsVersionRef.current = liveV;
            } else if (!saving) {
                return; // a cache ainda não tem a nossa última gravação — evita o flash
            }
        }
        if (saving) return;
        setSplit(liveSplit ?? null);
    }, [liveSplit, saving]);

    type ItemsMutator = (items: SplitItem[]) => SplitItem[];

    /**
     * Grava. Para escritas que tocam em `items` passa-se um `mutator` — é
     * re-aplicado sobre o estado **fresco** a cada tentativa, por isso um toque
     * concorrente (outro dispositivo / o link) nunca é pisado. `items_version`
     * (OCC) faz o PocketBase rejeitar (404) um write com base desatualizada →
     * relê e repete.
     */
    const runSaveSplit = async (
        updatedFields: Partial<Split>,
        mutator?: ItemsMutator,
    ) => {
        const base = splitRef.current;
        if (!base) return;
        const previousSplit = JSON.parse(JSON.stringify(base));

        if (!mutator) {
            setSplit({ ...base, ...updatedFields });
            if (!saving) setSaving(true);
            try {
                await splitsApi.update(splitId, updatedFields);
                await db.splits.update(splitId, updatedFields);
            } catch (error) {
                console.error('Error saving split:', error);
                showToast(mutationErrorMessage(error, 'Erro ao guardar alteração'), 'error');
                setSplit(previousSplit);
            } finally {
                setSaving(false);
            }
            return;
        }

        // Optimista: aplica já sobre o estado local.
        setSplit({
            ...base,
            ...updatedFields,
            items: reconcileSplitItems(mutator(base.items), base.participants),
        });
        if (!saving) setSaving(true);

        try {
            let baseSplit: Split = base;
            let expected = Math.max(
                itemsVersionRef.current ?? 0,
                base.items_version ?? 0,
            );
            for (let attempt = 0; attempt < 6; attempt++) {
                const nextItems = reconcileSplitItems(
                    mutator(baseSplit.items),
                    updatedFields.participants ?? baseSplit.participants,
                );
                try {
                    const saved = await splitsApi.updateItems(
                        splitId,
                        { ...updatedFields, items: nextItems },
                        expected,
                    );
                    itemsVersionRef.current = saved.items_version ?? expected + 1;
                    await db.splits.put(saved);
                    setSplit(normalizeSplitRecord(saved));
                    return;
                } catch (err) {
                    const status = (err as { status?: number })?.status;
                    if ((status === 404 || status === 403 || status === 400) && attempt < 5) {
                        baseSplit = await splitsApi.getById(splitId);
                        expected = baseSplit.items_version ?? 0;
                        itemsVersionRef.current = expected;
                        await new Promise((r) => setTimeout(r, 40 + 60 * attempt));
                        continue;
                    }
                    throw err;
                }
            }
            throw new Error('split_conflict');
        } catch (error) {
            try {
                const fresh = await splitsApi.getById(splitId);
                itemsVersionRef.current = fresh.items_version ?? null;
                await db.splits.put(fresh);
                setSplit(normalizeSplitRecord(fresh));
            } catch {
                setSplit(previousSplit);
            }
            if ((error as Error)?.message !== 'split_conflict') {
                console.error('Error saving split items:', error);
            }
            showToast(
                'Muita gente a mexer ao mesmo tempo — recarreguei. Confirma e tenta outra vez.',
                'error',
            );
        } finally {
            setSaving(false);
        }
    };

    const saveSplit = (updatedFields: Partial<Split>) => {
        const run = saveQueue.current
            .catch(() => {})
            .then(() => runSaveSplit(updatedFields));
        saveQueue.current = run;
        return run;
    };

    /** Escrita que toca em `items` — ver `runSaveSplit`. */
    const saveSplitItems = (mutator: ItemsMutator, extra: Partial<Split> = {}) => {
        const run = saveQueue.current
            .catch(() => {})
            .then(() => runSaveSplit(extra, mutator));
        saveQueue.current = run;
        return run;
    };

    // Atualização vinda de sheets/exports: aplica no estado local e na cache.
    const applySplitUpdate = useCallback((updated: Split) => {
        setSplit(normalizeSplitRecord(updated));
        void db.splits.put(updated);
    }, []);

    const addParticipantByName = async (name: string) => {
        if (!split) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        if (split.participants.includes(trimmed)) {
            showToast('Já existe', 'error');
            return;
        }
        await saveSplit({ participants: [...split.participants, trimmed] });
        setNewParticipant('');
    };

    const focusParticipantInput = () => {
        const el =
            typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
                ? participantInputDesktopRef.current
                : participantInputMobileRef.current;
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el?.focus();
    };

    const removeParticipant = async (name: string) => {
        if (!split || split.participants.length <= 1) return;
        if (!confirm(`Remover ${name}?`)) return;

        await saveSplitItems(
            (items) => items.map((item) => removeParticipantFromItem(item, name)),
            { participants: split.participants.filter((p) => p !== name) },
        );
    };

    const updateParticipantName = async (oldName: string, newName: string) => {
        if (!split || !newName.trim() || oldName === newName.trim()) return;
        if (split.participants.includes(newName.trim())) {
            showToast('Nome já existe', 'error');
            return;
        }
        const trimmed = newName.trim();
        await saveSplitItems(
            (items) => items.map((item) => renameParticipantInItem(item, oldName, trimmed)),
            { participants: split.participants.map((p) => (p === oldName ? trimmed : p)) },
        );
    };

    const addItem = async () => {
        if (!split) return;
        await saveSplitItems((items) => [
            ...items,
            { name: '', price: 0, participants: [], locked: false },
        ]);
    };

    const removeItem = async (idx: number) => {
        if (!split) return;
        const item = split.items[idx];
        if (item && shouldConfirmRemoveItem(item)) {
            if (!confirm(getRemoveItemConfirmMessage(item))) return;
        }
        await saveSplitItems((items) => items.filter((_, i) => i !== idx));
    };

    const handleScanConfirm = async (newItems: SplitItem[]) => {
        if (!split) return;
        await saveSplitItems((items) => [...items, ...newItems]);
    };

    const toggleParticipant = async (itemIdx: number, participant: string) => {
        if (!split) return;
        if (getSplitItemMode(split.items[itemIdx]) !== 'equal') {
            setAllocationSheetIdx(itemIdx);
            return;
        }
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            const item = next[itemIdx];
            if (!item) return next;
            const has = item.participants.includes(participant);
            next[itemIdx] = reconcileItemLock(
                {
                    ...item,
                    participants: has
                        ? item.participants.filter((p) => p !== participant)
                        : [...item.participants, participant],
                    split_mode: 'equal',
                    allocations: undefined,
                },
                split.participants,
            );
            return next;
        });
    };

    const handleSaveItemAllocation = async (updatedItem: SplitItem) => {
        if (!split || allocationSheetIdx === null) return;
        const idx = allocationSheetIdx;
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            if (next[idx]) next[idx] = reconcileItemLock(updatedItem, split.participants);
            return next;
        });
        setAllocationSheetIdx(null);
    };

    const toggleAllParticipants = async (itemIdx: number, checked: boolean) => {
        if (!split) return;
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            const item = next[itemIdx];
            if (!item) return next;
            next[itemIdx] = reconcileItemLock(
                {
                    ...item,
                    participants: checked ? [...split.participants] : [],
                    split_mode: 'equal',
                    allocations: undefined,
                },
                split.participants,
            );
            return next;
        });
    };

    const toggleItemLock = async (itemIdx: number) => {
        if (!split) return;
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            const item = next[itemIdx];
            if (item) next[itemIdx] = setItemLocked(item, !isItemLocked(item));
            return next;
        });
    };

    const updateItemName = async (idx: number, name: string) => {
        if (!split) return;
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            if (next[idx]) next[idx].name = name;
            return next;
        });
    };

    const updateItemPrice = async (idx: number, price: number) => {
        if (!split) return;
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            if (next[idx]) next[idx].price = price;
            return next;
        });
    };

    const totals = split ? calculateSplitTotals(split) : {};
    const grandTotal = split?.items.reduce((sum, item) => sum + item.price, 0) || 0;

    // Share — `modern-screenshot` (foreignObject SVG) em vez do `html2canvas` 1.4.1,
    // que não suporta as cores `oklch()` / `color-mix()` do Tailwind v4 e rebentava
    // em alguns devices. É também mais leve e rápido.
    const handleShare = async () => {
        if (!split || !shareRef.current) return;
        setSharing(true);
        try {
            const { domToBlob } = await import('modern-screenshot');
            const blob = await domToBlob(shareRef.current, {
                backgroundColor: '#ffffff',
                scale: 2,
            });
            if (!blob) throw new Error('imagem vazia');
            const file = new File([blob], `${split.name}.png`, { type: 'image/png' });

            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ title: split.name, files: [file] });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${split.name}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
                showToast('Imagem guardada!', 'success');
            }
        } catch (error) {
            const name = (error as Error)?.name;
            if (name === 'AbortError') return; // o utilizador cancelou o share nativo
            console.error('Partilhar imagem:', error);
            showToast(
                `Não consegui gerar a imagem${name ? ` (${name})` : ''}. Tira uma screenshot como alternativa.`,
                'error',
            );
        } finally {
            setSharing(false);
        }
    };

    const setSplitStatus = async (closed: boolean) => {
        if (!split) return;
        if (closed) {
            const msg =
                'Fechar esta divisão? Os participantes deixam de poder alterar marcações e o link público será desativado.';
            if (!confirm(msg)) return;
            await saveSplit(closeSplitPayload());
            showToast('Divisão fechada', 'success');
        } else {
            if (!confirm('Reabrir esta divisão para permitir alterações?')) return;
            await saveSplit(openSplitPayload());
            showToast('Divisão reaberta', 'success');
        }
    };

    const deleteSplit = async () => {
        if (!confirm('Eliminar esta divisão?')) return;
        try {
            await optimisticDelete({
                table: db.splits,
                id: splitId,
                commit: () => splitsApi.delete(splitId),
            });
            showToast('Divisão eliminada', 'success');
            navStart();
            router.push(`/groups/${groupId}/splits`);
        } catch (err) {
            showToast(mutationErrorMessage(err, 'Erro ao eliminar'), 'error');
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
                    <button onClick={() => { navStart(); router.push(`/groups/${groupId}/splits`); }} className="btn btn-primary px-6 py-2 mt-4">Voltar</button>
                </div>
            </div>
        );
    }

    const canManageSplit = isAdmin || split.created_by === user?.id;

    if (!canManageSplit) {
        return (
            <SplitMemberDetailView
                split={split}
                groupId={groupId}
                user={user}
                onSplitUpdate={applySplitUpdate}
            />
        );
    }

    const sortedTotals = Object.entries(totals).sort(([, a], [, b]) => b - a);
    const splitClosed = isSplitClosed(split);

    const renderItemLockButton = (itemIdx: number, locked: boolean) => (
        <button
            type="button"
            onClick={() => toggleItemLock(itemIdx)}
            className={cn(
                'p-1.5 rounded-lg transition-colors',
                locked
                    ? 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
            )}
            title={locked ? 'Desbloquear (permite remover participantes)' : 'Bloquear item'}
        >
            <Icon name={locked ? 'lock' : 'lock_open'} className="text-[20px]" />
        </button>
    );

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-32 md:pb-8">
            <Header showBack title={split.name} subtitle={split.description || 'Divisão'} groupId={groupId} />

            {saving && (
                <div className="fixed top-20 right-4 z-50 bg-primary-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-lg">
                    <LoadingSpinner size="sm" /> A guardar...
                </div>
            )}

            {splitClosed && (
                <div className="mx-4 md:mx-8 mt-4 max-w-[99%] lg:mx-auto rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                    <strong>Divisão fechada.</strong> Os participantes já não podem alterar marcações.
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
                                className="text-2xl font-bold bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-2 py-1 text-[var(--text-primary)] w-full"
                            />
                            <EditableInput
                                type="text"
                                value={split.description}
                                onSave={val => saveSplit({ description: val })}
                                placeholder="Descrição (opcional)"
                                className="block text-sm text-[var(--text-muted)] bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-2 py-1 w-full max-w-md"
                            />
                        </div>
                        <div className="flex flex-wrap gap-3 items-center">
                            <button
                                type="button"
                                onClick={() => setSplitStatus(!splitClosed)}
                                className={cn(
                                    'btn px-4 py-2 flex items-center gap-2',
                                    splitClosed
                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                                )}
                            >
                                <Icon name={splitClosed ? 'lock_open' : 'lock'} className="text-lg" />
                                {splitClosed ? 'Reabrir' : 'Fechar divisão'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowInviteSheet(true)}
                                disabled={splitClosed}
                                className="btn bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] px-4 py-2 flex items-center gap-2 disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                Convidar a marcar
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAllowedModesSheet(true)}
                                className="btn bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] px-4 py-2 flex items-center gap-2"
                            >
                                <Icon name="tune" className="text-lg" />
                                Definições
                            </button>
                            <button onClick={handleShare} disabled={sharing} className="btn btn-primary px-4 py-2 flex items-center gap-2">
                                {sharing ? <LoadingSpinner size="sm" /> : '📤'} Partilhar
                            </button>
                            <button onClick={deleteSplit} className="btn bg-red-500 hover:bg-red-600 text-white px-4 py-2">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </div>

                    <div className="mb-4">
                        <SplitParticipantNameInput
                            value={newParticipant}
                            onChange={setNewParticipant}
                            onAdd={(name) => void addParticipantByName(name)}
                            candidates={groupMembersToAdd}
                            inputRef={participantInputDesktopRef}
                        />
                    </div>

                    {/* Desktop Table Container */}
                    <div className="card shadow-xl overflow-hidden w-full border-[var(--border)]">
                        <div className="overflow-x-auto overflow-y-auto w-full max-h-[calc(100vh-220px)] border-collapse px-0.5">
                            <table className="w-full text-sm">
                                <thead className="bg-gradient-to-r from-primary-600 to-primary-600 text-white sticky top-0 z-30">
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
                                                    <Avatar name={p} src={participantAvatar(p)} size="sm" className="mb-1" />
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
                                            <button
                                                type="button"
                                                onClick={focusParticipantInput}
                                                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center mx-auto transition-colors"
                                                title="Adicionar participante"
                                            >
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
                                        const itemMode = getSplitItemMode(item);
                                        const activeParticipants = getActiveParticipants(item);
                                        const perPerson =
                                            itemMode === 'equal' && activeParticipants.length > 0
                                                ? item.price / activeParticipants.length
                                                : 0;
                                        const allSelected =
                                            itemMode === 'equal' &&
                                            item.participants.length === split.participants.length &&
                                            split.participants.length > 0;
                                        const locked = isItemLocked(item);
                                        return (
                                            <tr key={idx} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                                                <td className="px-4 py-3">
                                                    <EditableInput
                                                        type="text"
                                                        value={item.name}
                                                        onSave={val => updateItemName(idx, val)}
                                                        placeholder="Nome do item"
                                                        className="w-full px-2 py-1 border border-transparent hover:border-[var(--border)] focus:border-primary-500 rounded-lg bg-transparent focus:bg-white transition"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setAllocationSheetIdx(idx)}
                                                        className="mt-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                                                    >
                                                        {getItemModeShortLabel(item)}
                                                    </button>
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
                                                            className="w-20 px-2 py-1 border border-transparent hover:border-[var(--border)] focus:border-primary-500 rounded-lg bg-transparent text-right focus:bg-white transition"
                                                        />
                                                        <span className="text-[var(--text-muted)]">€</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        onChange={e => toggleAllParticipants(idx, e.target.checked)}
                                                        className="w-5 h-5 rounded border-2 border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                    />
                                                </td>
                                                {split.participants.map(p => (
                                                    <td key={p} className="px-3 py-3 text-center">
                                                        {itemMode === 'equal' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={item.participants.includes(p)}
                                                                onChange={() => toggleParticipant(idx, p)}
                                                                className="w-5 h-5 rounded border-2 border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                            />
                                                        ) : activeParticipants.includes(p) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setAllocationSheetIdx(idx)}
                                                                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                                                            >
                                                                {formatCurrency(computeParticipantAmount(item, p))}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[var(--text-muted)]">—</span>
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        {renderItemLockButton(idx, locked)}
                                                        <button onClick={() => removeItem(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors" title="Remover item">
                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-primary-600">
                                                    {itemMode === 'equal'
                                                        ? formatCurrency(perPerson)
                                                        : getItemModeShortLabel(item)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Add item row */}
                                    <tr className="bg-[var(--bg-tertiary)]">
                                        <td colSpan={5 + split.participants.length} className="px-4 py-3">
                                            <div className="flex items-center gap-4">
                                                <button onClick={addItem} className="flex items-center gap-2 text-primary-600 hover:underline font-medium">
                                                    <span className="text-lg">+</span> Adicionar Item
                                                </button>
                                                <button onClick={() => setShowScanSheet(true)} className="flex items-center gap-2 text-primary-600 hover:underline font-medium">
                                                    <Icon name="receipt_long" className="text-lg" /> Scan Fatura
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                                <tfoot className="bg-gradient-to-r from-primary-700 to-primary-700 text-white sticky bottom-0 z-30">
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
                {/* Participantes */}
                <section className="card">
                    <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
                        <button
                            type="button"
                            onClick={toggleParticipantsExpanded}
                            className="flex-1 flex items-center justify-between min-w-0"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-[var(--text-primary)]">Participantes</span>
                                <span className="text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full shrink-0">
                                    {split.participants.length}
                                </span>
                            </div>
                            <svg
                                className={cn(
                                    'w-5 h-5 text-[var(--text-muted)] shrink-0 ml-2 transition-transform',
                                    participantsExpanded && 'rotate-180'
                                )}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                    {participantsExpanded && (
                        <div className="px-3 pb-3 border-t border-[var(--border)]">
                            <div className="flex flex-wrap gap-2 py-3">
                                {split.participants.map(p => (
                                    <div
                                        key={p}
                                        title={p}
                                        className="inline-flex max-w-full items-center gap-1.5 bg-[var(--bg-tertiary)] rounded-full pl-1 pr-1 py-1 text-sm"
                                    >
                                        <Avatar name={p} src={participantAvatar(p)} size="xs" className="shrink-0" />
                                        <span className="font-medium text-[var(--text-primary)] break-words leading-tight max-w-[9.5rem]">
                                            {p}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeParticipant(p)}
                                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            aria-label={`Remover ${p}`}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <SplitParticipantNameInput
                                value={newParticipant}
                                onChange={setNewParticipant}
                                onAdd={(name) => void addParticipantByName(name)}
                                candidates={groupMembersToAdd}
                                inputRef={participantInputMobileRef}
                            />
                        </div>
                    )}
                </section>

                {/* Items */}
                <div className="flex items-center justify-between gap-2 my-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[var(--text-primary)]">Itens</span>
                        <span className="text-sm text-[var(--text-muted)]">{split.items.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setSplitStatus(!splitClosed)}
                            className={cn(
                                'text-xs font-semibold px-2.5 py-1.5 rounded-lg border',
                                splitClosed
                                    ? 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30'
                                    : 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30'
                            )}
                        >
                            {splitClosed ? 'Reabrir' : 'Fechar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowInviteSheet(true)}
                            disabled={splitClosed}
                            title="Convidar a marcar"
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-50"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAllowedModesSheet(true)}
                            title="Definições"
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                        >
                            <Icon name="tune" className="text-[18px]" />
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    {split.items.map((item, idx) => {
                        const itemMode = getSplitItemMode(item);
                        const activeParticipants = getActiveParticipants(item);
                        const perPerson =
                            itemMode === 'equal' && activeParticipants.length > 0
                                ? item.price / activeParticipants.length
                                : 0;
                        const allSelected =
                            itemMode === 'equal' &&
                            item.participants.length === split.participants.length &&
                            split.participants.length > 0;
                        const locked = isItemLocked(item);
                        return (
                            <div key={idx} className="card p-3 space-y-3 shadow-sm border border-[var(--border)]">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <EditableInput
                                            type="text"
                                            value={item.name}
                                            onSave={val => updateItemName(idx, val)}
                                            placeholder="Nome do item"
                                            className="w-full text-base font-semibold bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition placeholder:text-[var(--text-muted)]/50"
                                        />
                                    </div>

                                    <div className="w-28 relative flex items-center">
                                        <EditableInput
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={item.price || ''}
                                            onSave={val => updateItemPrice(idx, parseFloat(val) || 0)}
                                            placeholder="0"
                                            className="w-full text-right text-base font-bold text-primary-600 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl pl-2 pr-8 py-2.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                                        />
                                        <span className="absolute right-3 text-[var(--text-muted)] text-sm font-medium">€</span>
                                    </div>

                                    <div className="flex items-center gap-0.5 shrink-0">
                                        {renderItemLockButton(idx, locked)}
                                        <button
                                            onClick={() => removeItem(idx)}
                                            className="h-10 w-10 flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                                            title="Remover item"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Participants Section */}
                                <div className="bg-[var(--bg-tertiary)]/30 px-3 py-3 border border-[var(--border)] border-dashed rounded-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Dividir com</span>
                                            {locked && (
                                                <Icon name="lock" className="text-[14px] text-primary-600 dark:text-primary-400" title="Bloqueado" />
                                            )}
                                            {itemMode === 'equal' && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleAllParticipants(idx, !allSelected)}
                                                    className="text-[10px] font-bold text-primary-600 hover:underline bg-primary-100 dark:bg-primary-900/30 px-2 py-0.5 rounded-md"
                                                >
                                                    {allSelected ? 'Ninguém' : 'Todos'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {itemMode === 'equal' && activeParticipants.length > 0 && (
                                                <div className="text-right flex items-center gap-1.5">
                                                    <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{formatCurrency(perPerson)}</span>
                                                    <span className="text-[10px] font-medium text-[var(--text-muted)]">/pessoa</span>
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setAllocationSheetIdx(idx)}
                                                className="text-xs font-semibold text-primary-600 dark:text-primary-400 px-2.5 py-1 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30"
                                            >
                                                {getItemModeShortLabel(item)}
                                            </button>
                                        </div>
                                    </div>

                                    {itemMode === 'equal' ? (
                                        <div className="flex flex-wrap gap-2">
                                            {split.participants.map(p => {
                                                const isSelected = item.participants.includes(p);
                                                return (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => toggleParticipant(idx, p)}
                                                        className={cn(
                                                            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition duration-200 border shadow-sm',
                                                            isSelected
                                                                ? 'bg-primary-500 border-primary-500 text-white shadow-primary-500/20'
                                                                : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                                                        )}
                                                    >
                                                        {isSelected && <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                        <Avatar name={p} src={participantAvatar(p)} size="xs" className="shrink-0" />
                                                        {p}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {activeParticipants.map(p => (
                                                <div
                                                    key={p}
                                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-[var(--border)] bg-[var(--bg-primary)]"
                                                >
                                                    <Avatar name={p} src={participantAvatar(p)} size="xs" />
                                                    <span className="text-[var(--text-primary)]">{p}</span>
                                                    <span className="font-bold text-primary-600 dark:text-primary-400">
                                                        {formatCurrency(computeParticipantAmount(item, p))}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div className="flex gap-2">
                        <button onClick={addItem} className="flex-1 p-4 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center gap-2">
                            + Adicionar Item
                        </button>
                        <button onClick={() => setShowScanSheet(true)} className="flex-1 p-4 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center gap-2">
                            <Icon name="receipt_long" className="text-lg" /> Scan Fatura
                        </button>
                    </div>
                </div>
            </main>

            {/* Mobile Bottom Totals */}
            <div
                className={cn(
                    'lg:hidden fixed left-0 right-0 bg-[var(--bg-secondary)] border-t border-[var(--border)] shadow-lg z-40',
                    isAdmin ? 'bottom-[var(--bottom-nav-total-height)]' : 'bottom-[var(--safe-bottom)]'
                )}
            >
                <button onClick={() => setTotalsExpanded(!totalsExpanded)} className="w-full px-4 py-3 flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">Total</span>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatCurrency(grandTotal)}</span>
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
                                    <span className="font-medium text-primary-600 dark:text-primary-400">{formatCurrency(amount)}</span>
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
                            <span style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>{formatCurrency(grandTotal)}</span>
                        </div>
                    </div>
                    <div>
                        {sortedTotals.map(([name, amount]) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                                <span style={{ color: '#374151' }}>{name}</span>
                                <span style={{ fontWeight: 600, color: '#2563eb' }}>{formatCurrency(amount)}</span>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, textAlign: 'center' }}>Gerado por Order It All!</p>
                </div>
            </div>
            {/* Fullscreen Table Modal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-[100] bg-[var(--bg-primary)] flex flex-col animate-in fade-in duration-200">
                    <div className="flex items-center justify-between p-2 border-b border-[var(--border)] bg-white dark:bg-slate-900 shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">📊</span>
                            <div>
                                <h2 className="font-bold text-[var(--text-primary)] text-base">{split.name}</h2>
                                <p className="text-[10px] text-[var(--text-muted)] leading-tight">Modo Ecrã Inteiro</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors group"
                            title="Fechar"
                        >
                            <svg className="w-6 h-6 text-gray-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-hidden bg-white">
                        <div className="h-full overflow-hidden flex flex-col">
                            <div className="overflow-x-auto overflow-y-auto flex-1 px-0.5">
                                <table className="w-full text-sm border-collapse">
                                    <thead className="bg-gradient-to-r from-primary-600 to-primary-600 text-white sticky top-0 z-30">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-bold text-sm min-w-[200px]">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setIsFullscreen(false)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Sair do Ecrã Inteiro">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                                    </button>
                                                    <span>Item</span>
                                                </div>
                                            </th>
                                            <th className="px-3 py-2 text-right font-semibold min-w-[100px]">Preço</th>
                                            <th className="px-2 py-2 text-center font-semibold min-w-[60px]">Todos</th>
                                            {split.participants.map((p, idx) => (
                                                <th key={idx} className="px-2 py-2 text-center font-semibold min-w-[100px]">
                                                    <div className="flex flex-col items-center">
                                                        <Avatar name={p} src={participantAvatar(p)} size="sm" className="mb-1" />
                                                        <span className="text-xs font-medium truncate max-w-[90px]">{p}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-2 py-2 text-center min-w-[60px]">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsFullscreen(false);
                                                        window.setTimeout(() => focusParticipantInput(), 150);
                                                    }}
                                                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center mx-auto transition-colors"
                                                    title="Adicionar participante"
                                                >
                                                    <span className="text-lg">+</span>
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-right font-semibold min-w-[120px]">Por Pessoa</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)] bg-white dark:bg-slate-900">
                                        {split.items.map((item, idx) => {
                                            const itemMode = getSplitItemMode(item);
                                            const activeParticipants = getActiveParticipants(item);
                                            const perPerson =
                                                itemMode === 'equal' && activeParticipants.length > 0
                                                    ? item.price / activeParticipants.length
                                                    : 0;
                                            const allSelected =
                                                itemMode === 'equal' &&
                                                item.participants.length === split.participants.length &&
                                                split.participants.length > 0;
                                            const locked = isItemLocked(item);
                                            return (
                                                <tr key={idx} className="hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                                                    <td className="px-3 py-2">
                                                        <EditableInput
                                                            type="text"
                                                            value={item.name}
                                                            onSave={val => updateItemName(idx, val)}
                                                            placeholder="Nome do item"
                                                            className="w-full px-2 py-1 border border-transparent hover:border-primary-200 focus:border-primary-500 rounded bg-transparent focus:bg-white dark:focus:bg-slate-800 font-medium"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsFullscreen(false);
                                                                setAllocationSheetIdx(idx);
                                                            }}
                                                            className="mt-1 text-[10px] font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                                                        >
                                                            {getItemModeShortLabel(item)}
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <EditableInput
                                                                type="number"
                                                                min={0}
                                                                step={0.01}
                                                                value={item.price || ''}
                                                                onSave={val => updateItemPrice(idx, parseFloat(val) || 0)}
                                                                placeholder="0.00"
                                                                className="w-20 px-2 py-1 border border-transparent hover:border-primary-200 focus:border-primary-500 rounded bg-transparent text-right focus:bg-white dark:focus:bg-slate-800"
                                                            />
                                                            <span className="text-gray-400">€</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={allSelected}
                                                            onChange={e => toggleAllParticipants(idx, e.target.checked)}
                                                            className="w-5 h-5 rounded border-2 border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    {split.participants.map(p => (
                                                        <td key={p} className="px-2 py-2 text-center">
                                                            {itemMode === 'equal' ? (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.participants.includes(p)}
                                                                    onChange={() => toggleParticipant(idx, p)}
                                                                    className="w-5 h-5 rounded border-2 border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                                />
                                                            ) : activeParticipants.includes(p) ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setIsFullscreen(false);
                                                                        setAllocationSheetIdx(idx);
                                                                    }}
                                                                    className="text-[10px] font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                                                                >
                                                                    {formatCurrency(computeParticipantAmount(item, p))}
                                                                </button>
                                                            ) : (
                                                                <span className="text-[var(--text-muted)]">—</span>
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="px-2 py-2 text-center">
                                                        <div className="flex items-center justify-center gap-0.5">
                                                            {renderItemLockButton(idx, locked)}
                                                            <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Remover item">
                                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-bold text-primary-600 text-base">
                                                        {itemMode === 'equal'
                                                            ? formatCurrency(perPerson)
                                                            : getItemModeShortLabel(item)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-[var(--bg-tertiary)]">
                                            <td colSpan={5 + split.participants.length} className="px-3 py-2">
                                                <div className="flex items-center gap-4">
                                                    <button onClick={addItem} className="flex items-center gap-2 text-primary-600 hover:underline font-medium">
                                                        <span className="text-lg">+</span> Adicionar Item
                                                    </button>
                                                    <button onClick={() => setShowScanSheet(true)} className="flex items-center gap-2 text-primary-600 hover:underline font-medium">
                                                        <Icon name="receipt_long" className="text-lg" /> Scan Fatura
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                    <tfoot className="bg-gradient-to-r from-primary-700 to-primary-700 text-white sticky bottom-0 z-30">
                                        <tr>
                                            <td className="px-3 py-2 font-bold uppercase text-xs tracking-wider">Total Geral</td>
                                            <td className="px-3 py-2 text-right font-black text-lg">{formatCurrency(grandTotal)}</td>
                                            <td className="px-2 py-2"></td>
                                            {split.participants.map(p => (
                                                <td key={p} className="px-2 py-2 text-center font-black text-base">
                                                    {formatCurrency(totals[p] || 0)}
                                                </td>
                                            ))}
                                            <td className="px-2 py-2"></td>
                                            <td className="px-3 py-2 text-right font-black text-lg">{formatCurrency(grandTotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SplitItemAllocationSheet
                isOpen={allocationSheetIdx !== null}
                onClose={() => setAllocationSheetIdx(null)}
                itemIndex={allocationSheetIdx}
                item={allocationSheetIdx !== null ? split.items[allocationSheetIdx] ?? null : null}
                allParticipants={split.participants}
                group={currentGroup}
                onSave={(item) => void handleSaveItemAllocation(item)}
            />

            <SplitShareSheet
                isOpen={showInviteSheet}
                onClose={() => setShowInviteSheet(false)}
                split={split}
                onSplitUpdate={applySplitUpdate}
            />

            <SplitAllowedModesSheet
                isOpen={showAllowedModesSheet}
                onClose={() => setShowAllowedModesSheet(false)}
                split={split}
                onSplitUpdate={applySplitUpdate}
            />

            <SplitInvoiceScanSheet
                isOpen={showScanSheet}
                onClose={() => setShowScanSheet(false)}
                user={user}
                updateProfile={updateProfile}
                onConfirm={handleScanConfirm}
            />
        </div>
    );
}
