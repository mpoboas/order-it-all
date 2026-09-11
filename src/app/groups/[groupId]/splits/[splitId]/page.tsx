'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useSmartRouter } from '@/hooks/useSmartRouter';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
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
    setItemLocked,
    shouldConfirmRemoveItem,
} from '@/lib/splitItems';
import {
    closeSplitPayload,
    isSplitClosed,
    normalizeSplitRecord,
    openSplitPayload,
} from '@/lib/splitStatus';
import { cn } from '@/lib/utils';
import { Money } from '@/components/ui/Money';
import { Collapse } from '@/components/ui/Collapse';
import { formatPriceInput, parseEUR } from '@/lib/money';
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
    const router = useSmartRouter();
    const { user, isLoggedIn, updateProfile } = useUser();
    const { currentGroup, isAdmin } = useGroup();
    const { showToast } = useToast();
    const confirmAction = useConfirm();
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
    // Item trancado + toque num participante → treme o cadeado ("está fixo").
    const [shakeLockIdx, setShakeLockIdx] = useState<number | null>(null);
    const bumpLockShake = (idx: number) => {
        setShakeLockIdx(idx);
        setTimeout(() => setShakeLockIdx((cur) => (cur === idx ? null : cur)), 450);
    };

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

        // Optimista: aplica já sobre o estado local. O `locked` é da
        // responsabilidade de cada mutator (os que mexem em participantes já
        // chamam `reconcileItemLock`) — não se recalcula aqui, senão o botão de
        // lock manual nunca pegava.
        setSplit({
            ...base,
            ...updatedFields,
            items: mutator(base.items),
        });
        if (!saving) setSaving(true);

        try {
            let baseSplit: Split = base;
            let expected = Math.max(
                itemsVersionRef.current ?? 0,
                base.items_version ?? 0,
            );
            for (let attempt = 0; attempt < 6; attempt++) {
                const nextItems = mutator(baseSplit.items);
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
        if (!(await confirmAction({
            title: `Remover ${name}?`,
            tone: 'danger',
            confirmLabel: 'Remover',
        }))) return;

        const nextParticipants = split.participants.filter((p) => p !== name);
        await saveSplitItems(
            (items) =>
                items.map((item) =>
                    reconcileItemLock(removeParticipantFromItem(item, name), nextParticipants),
                ),
            { participants: nextParticipants },
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
            if (!(await confirmAction({
                title: getRemoveItemConfirmMessage(item),
                tone: 'danger',
                confirmLabel: 'Remover',
            }))) return;
        }
        await saveSplitItems((items) => items.filter((_, i) => i !== idx));
    };

    const handleScanConfirm = async (newItems: SplitItem[]) => {
        if (!split) return;
        await saveSplitItems((items) => [...items, ...newItems]);
    };

    const toggleParticipant = async (itemIdx: number, participant: string) => {
        if (!split) return;
        if (isItemLocked(split.items[itemIdx])) {
            bumpLockShake(itemIdx);
            return;
        }
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
        if (isItemLocked(split.items[itemIdx])) {
            bumpLockShake(itemIdx);
            return;
        }
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
            if (!(await confirmAction({
                title: 'Fechar esta divisão?',
                description: 'Os participantes deixam de poder alterar marcações e o link público será desativado.',
                tone: 'warning',
                confirmLabel: 'Fechar divisão',
            }))) return;
            await saveSplit(closeSplitPayload());
            showToast('Divisão fechada', 'success');
        } else {
            if (!(await confirmAction({
                title: 'Reabrir esta divisão para permitir alterações?',
                confirmLabel: 'Reabrir',
            }))) return;
            await saveSplit(openSplitPayload());
            showToast('Divisão reaberta', 'success');
        }
    };

    const deleteSplit = async () => {
        if (!(await confirmAction({
            title: 'Eliminar esta divisão?',
            tone: 'danger',
            confirmLabel: 'Eliminar',
        }))) return;
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
            <div className="min-h-screen bg-app">
                <Header showBack title="Divisão" groupId={groupId} />
                <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
            </div>
        );
    }

    if (!split) {
        return (
            <div className="min-h-screen bg-app">
                <Header showBack title="Divisão" groupId={groupId} />
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
                    : 'text-ink-faint hover:bg-surface-sunken'
            )}
            title={locked ? 'Desbloquear — permite entrar/sair deste item' : 'Bloquear — fixa quem participa neste item'}
        >
            <Icon
                name={locked ? 'lock' : 'lock_open'}
                className={cn('text-[20px]', shakeLockIdx === itemIdx && 'lock-shake')}
            />
        </button>
    );

    return (
        <div className="min-h-screen bg-app pb-32 md:pb-8">
            <Header showBack title={split.name} subtitle={split.description || 'Divisão'} groupId={groupId} />

            {saving && (
                <div className="fixed top-20 right-4 z-50 bg-primary-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-lg">
                    <LoadingSpinner size="sm" /> A guardar...
                </div>
            )}

            {splitClosed && (
                <div className="mx-4 md:mx-8 mt-4 max-w-[99%] lg:mx-auto rounded-xl border border-warning-fg/25 bg-warning-bg px-4 py-3 text-sm text-warning-fg">
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
                                className="text-2xl font-bold bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-2 py-1 text-ink w-full"
                            />
                            <EditableInput
                                type="text"
                                value={split.description}
                                onSave={val => saveSplit({ description: val })}
                                placeholder="Descrição (opcional)"
                                className="block text-sm text-ink-faint bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-2 py-1 w-full max-w-md"
                            />
                        </div>
                        <div className="flex flex-wrap gap-3 items-center">
                            <button
                                type="button"
                                onClick={() => setSplitStatus(!splitClosed)}
                                className={cn(
                                    'btn px-4 py-2 flex items-center gap-2',
                                    splitClosed
                                        ? 'bg-success-bg text-success-fg hover:brightness-95'
                                        : 'bg-warning-bg text-warning-fg hover:brightness-95'
                                )}
                            >
                                <Icon name={splitClosed ? 'lock_open' : 'lock'} className="text-lg" />
                                {splitClosed ? 'Reabrir' : 'Fechar divisão'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowInviteSheet(true)}
                                disabled={splitClosed}
                                className="btn bg-surface-sunken text-ink hover:bg-surface px-4 py-2 flex items-center gap-2 disabled:opacity-50"
                            >
                                <Icon name="link" className="text-base" />
                                Convidar a marcar
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAllowedModesSheet(true)}
                                className="btn bg-surface-sunken text-ink hover:bg-surface px-4 py-2 flex items-center gap-2"
                            >
                                <Icon name="tune" className="text-lg" />
                                Definições
                            </button>
                            <button onClick={handleShare} disabled={sharing} className="btn btn-primary px-4 py-2 flex items-center gap-2">
                                {sharing ? <LoadingSpinner size="sm" /> : <Icon name="share" className="text-base" />} Partilhar
                            </button>
                            <button onClick={deleteSplit} className="btn bg-danger hover:brightness-110 text-white px-4 py-2">
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
                    <div className="card shadow-xl overflow-hidden w-full border-hairline">
                        <div className="overflow-x-auto overflow-y-auto w-full max-h-[calc(100vh-220px)] border-collapse px-0.5">
                            <table className="w-full text-sm">
                                <thead className="bg-gradient-to-r from-primary-600 to-primary-600 text-white sticky top-0 z-30">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold min-w-[200px]">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setIsFullscreen(true)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Ecrã Inteiro">
                                                    <Icon name="fullscreen" className="text-base" />
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
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
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
                                                    <Icon name="fullscreen" className="text-lg" />
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
                                            <tr key={idx} className="hover:bg-surface-sunken transition-colors">
                                                <td className="px-4 py-3">
                                                    <EditableInput
                                                        type="text"
                                                        value={item.name}
                                                        onSave={val => updateItemName(idx, val)}
                                                        placeholder="Nome do item"
                                                        className="w-full px-2 py-1 border border-transparent hover:border-hairline focus:border-primary-500 rounded-lg bg-transparent focus:bg-surface transition"
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
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={item.price ? formatPriceInput(item.price) : ""}
                                                            onSave={val => updateItemPrice(idx, parseEUR(val))}
                                                            placeholder="0,00"
                                                            className="w-20 px-2 py-1 border border-transparent hover:border-hairline focus:border-primary-500 rounded-lg bg-transparent text-right focus:bg-surface transition"
                                                        />
                                                        <span className="text-ink-faint">€</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        onChange={e => toggleAllParticipants(idx, e.target.checked)}
                                                        className={cn('w-5 h-5 rounded border-2 border-hairline-strong text-primary-600 focus:ring-primary-500 cursor-pointer', locked && 'opacity-40')}
                                                    />
                                                </td>
                                                {split.participants.map(p => (
                                                    <td key={p} className="px-3 py-3 text-center">
                                                        {itemMode === 'equal' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={item.participants.includes(p)}
                                                                onChange={() => toggleParticipant(idx, p)}
                                                                className={cn('w-5 h-5 rounded border-2 border-hairline-strong text-primary-600 focus:ring-primary-500 cursor-pointer', locked && 'opacity-40')}
                                                            />
                                                        ) : activeParticipants.includes(p) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setAllocationSheetIdx(idx)}
                                                                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                                                            >
                                                                <Money value={computeParticipantAmount(item, p)} />
                                                            </button>
                                                        ) : (
                                                            <span className="text-ink-faint">—</span>
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        {renderItemLockButton(idx, locked)}
                                                        <button onClick={() => removeItem(idx)} className="p-1 text-danger hover:bg-danger-bg rounded transition-colors" title="Remover item">
                                                            <Icon name="delete_outline" className="text-base" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold text-primary-600">
                                                    {itemMode === 'equal'
                                                        ? <Money value={perPerson} />
                                                        : getItemModeShortLabel(item)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Add item row */}
                                    <tr className="bg-surface-sunken">
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
                                        <td className="px-4 py-3 text-right font-bold"><Money value={grandTotal} /></td>
                                        <td className="px-4 py-3"></td>
                                        {split.participants.map(p => (
                                            <td key={p} className="px-3 py-3 text-center font-bold">
                                                <Money value={totals[p] || 0} />
                                            </td>
                                        ))}
                                        <td className="px-3 py-3"></td>
                                        <td className="px-4 py-3 text-right font-bold"><Money value={grandTotal} /></td>
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
                    <div className="flex items-center gap-2 p-3">
                        <button
                            type="button"
                            onClick={toggleParticipantsExpanded}
                            className="flex-1 flex items-center justify-between min-w-0"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-ink">Participantes</span>
                                <span className="text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full shrink-0">
                                    {split.participants.length}
                                </span>
                            </div>
                            <Icon
                                name="keyboard_arrow_down"
                                className={cn(
                                    'text-xl text-ink-faint shrink-0 ml-2 transition-transform',
                                    participantsExpanded && 'rotate-180',
                                )}
                            />
                        </button>
                    </div>
                    <Collapse open={participantsExpanded}>
                        <div className="px-3 pb-3 border-t border-hairline">
                            <div className="flex flex-wrap gap-2 py-3">
                                {split.participants.map(p => (
                                    <div
                                        key={p}
                                        title={p}
                                        className="inline-flex max-w-full items-center gap-1.5 bg-surface-sunken rounded-full pl-1 pr-1 py-1 text-sm"
                                    >
                                        <Avatar name={p} src={participantAvatar(p)} size="xs" className="shrink-0" />
                                        <span className="font-medium text-ink break-words leading-tight max-w-[9.5rem]">
                                            {p}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeParticipant(p)}
                                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-ink-faint hover:text-danger hover:bg-danger-bg"
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
                    </Collapse>
                </section>

                {/* Items */}
                <div className="flex items-center justify-between gap-2 my-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-ink">Itens</span>
                        <span className="text-sm text-ink-faint">{split.items.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setSplitStatus(!splitClosed)}
                            className={cn(
                                'text-xs font-semibold px-2.5 py-1.5 rounded-lg border',
                                splitClosed
                                    ? 'text-success-fg border-success-fg/25 bg-success-bg'
                                    : 'text-warning-fg border-warning-fg/25 bg-warning-bg'
                            )}
                        >
                            {splitClosed ? 'Reabrir' : 'Fechar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowInviteSheet(true)}
                            disabled={splitClosed}
                            title="Convidar a marcar"
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-ink-soft disabled:opacity-50"
                        >
                            <Icon name="link" className="text-base" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAllowedModesSheet(true)}
                            title="Definições"
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-ink-soft"
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
                            <div key={idx} className="card p-3 space-y-3 shadow-sm border border-hairline">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <EditableInput
                                            type="text"
                                            value={item.name}
                                            onSave={val => updateItemName(idx, val)}
                                            placeholder="Nome do item"
                                            className="w-full text-base font-semibold bg-surface border border-hairline rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition placeholder:text-ink-faint/50"
                                        />
                                    </div>

                                    <div className="w-28 relative flex items-center">
                                        <EditableInput
                                            type="text"
                                            inputMode="decimal"
                                            value={item.price ? formatPriceInput(item.price) : ""}
                                            onSave={val => updateItemPrice(idx, parseEUR(val))}
                                            placeholder="0,00"
                                            className="w-full text-right text-base font-bold text-primary-600 bg-surface border border-hairline rounded-xl pl-2 pr-8 py-2.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                                        />
                                        <span className="absolute right-3 text-ink-faint text-sm font-medium">€</span>
                                    </div>

                                    <div className="flex items-center gap-0.5 shrink-0">
                                        {renderItemLockButton(idx, locked)}
                                        <button
                                            onClick={() => removeItem(idx)}
                                            className="h-10 w-10 flex items-center justify-center text-ink-faint hover:text-danger hover:bg-danger-bg rounded-xl transition border border-transparent hover:border-danger/20"
                                            title="Remover item"
                                        >
                                            <Icon name="delete_outline" className="text-lg" />
                                        </button>
                                    </div>
                                </div>

                                {/* Participants Section */}
                                <div className="bg-surface-sunken/30 px-3 py-3 border border-hairline border-dashed rounded-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-ink-faint uppercase tracking-wider">Dividir com</span>
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
                                                    <span className="text-sm font-bold text-primary-600 dark:text-primary-400"><Money value={perPerson} /></span>
                                                    <span className="text-[10px] font-medium text-ink-faint">/pessoa</span>
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
                                                                : 'bg-app border-hairline text-ink-soft hover:bg-surface',
                                                            locked && 'opacity-40'
                                                        )}
                                                    >
                                                        {isSelected && <Icon name="check" className="text-[15px] shrink-0" strokeWidth={3} />}
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
                                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-hairline bg-app"
                                                >
                                                    <Avatar name={p} src={participantAvatar(p)} size="xs" />
                                                    <span className="text-ink">{p}</span>
                                                    <span className="font-bold text-primary-600 dark:text-primary-400">
                                                        <Money value={computeParticipantAmount(item, p)} />
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
                        <button onClick={addItem} className="flex-1 p-4 border-2 border-dashed border-hairline rounded-xl text-ink-faint hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center gap-2">
                            + Adicionar Item
                        </button>
                        <button onClick={() => setShowScanSheet(true)} className="flex-1 p-4 border-2 border-dashed border-hairline rounded-xl text-ink-faint hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center gap-2">
                            <Icon name="receipt_long" className="text-lg" /> Scan Fatura
                        </button>
                    </div>
                </div>
            </main>

            {/* Mobile Bottom Totals */}
            <div
                className={cn(
                    'lg:hidden fixed left-0 right-0 bg-surface border-t border-hairline shadow-lg z-40',
                    isAdmin ? 'bottom-[var(--bottom-nav-total-height)]' : 'bottom-[var(--safe-bottom)]'
                )}
            >
                <button onClick={() => setTotalsExpanded(!totalsExpanded)} className="w-full px-4 py-3 flex items-center justify-between">
                    <span className="font-semibold text-ink">Total</span>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary-600 dark:text-primary-400"><Money value={grandTotal} /></span>
                        <Icon name="keyboard_arrow_up" className={cn("text-xl text-ink-faint transition-transform", totalsExpanded && "rotate-180")} />
                    </div>
                </button>
                <Collapse open={totalsExpanded}>
                    <div className="px-4 pb-3 border-t border-hairline bg-surface">
                        <div className="py-2 text-sm space-y-1">
                            {sortedTotals.map(([name, amount]) => (
                                <div key={name} className="flex justify-between">
                                    <span className="text-ink-soft">{name}</span>
                                    <span className="font-medium text-primary-600 dark:text-primary-400"><Money value={amount} /></span>
                                </div>
                            ))}
                        </div>
                        <button onClick={handleShare} disabled={sharing} className="w-full mt-2 btn btn-primary py-2 text-sm flex items-center justify-center gap-2">
                            {sharing ? <LoadingSpinner size="sm" /> : <Icon name="share" className="text-base" />} Partilhar Imagem
                        </button>
                    </div>
                </Collapse>
            </div>

            {/* Hidden share image */}
            <div className="fixed -left-[9999px] top-0">
                <div ref={shareRef} style={{ width: 400, backgroundColor: '#ffffff', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>💰 {split.name}</h2>
                    <p style={{ color: '#6b7280', marginBottom: 16 }}>{split.description || 'Divisão de despesas'}</p>
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ color: '#4b5563', fontWeight: 500 }}>Total</span>
                            <span style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}><Money value={grandTotal} /></span>
                        </div>
                    </div>
                    <div>
                        {sortedTotals.map(([name, amount]) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                                <span style={{ color: '#374151' }}>{name}</span>
                                <span style={{ fontWeight: 600, color: '#2563eb' }}><Money value={amount} /></span>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, textAlign: 'center' }}>Gerado por Order It All!</p>
                </div>
            </div>
            {/* Fullscreen Table Modal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-[100] bg-app flex flex-col animate-in fade-in duration-200">
                    <div className="flex items-center justify-between p-2 border-b border-hairline bg-surface shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">📊</span>
                            <div>
                                <h2 className="font-bold text-ink text-base">{split.name}</h2>
                                <p className="text-[10px] text-ink-faint leading-tight">Modo Ecrã Inteiro</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-1.5 hover:bg-surface-sunken rounded-full transition-colors group"
                            title="Fechar"
                        >
                            <Icon name="close" className="text-2xl text-ink-faint group-hover:text-danger" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-hidden bg-surface">
                        <div className="h-full overflow-hidden flex flex-col">
                            <div className="overflow-x-auto overflow-y-auto flex-1 px-0.5">
                                <table className="w-full text-sm border-collapse">
                                    <thead className="bg-gradient-to-r from-primary-600 to-primary-600 text-white sticky top-0 z-30">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-bold text-sm min-w-[200px]">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setIsFullscreen(false)} className="p-1 hover:bg-white/20 rounded transition-colors" title="Sair do Ecrã Inteiro">
                                                        <Icon name="fullscreen" className="text-base" />
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
                                    <tbody className="divide-y divide-[var(--border)] bg-surface">
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
                                                            className="w-full px-2 py-1 border border-transparent hover:border-primary-200 focus:border-primary-500 rounded bg-transparent focus:bg-surface font-medium"
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
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={item.price ? formatPriceInput(item.price) : ""}
                                                                onSave={val => updateItemPrice(idx, parseEUR(val))}
                                                                placeholder="0,00"
                                                                className="w-20 px-2 py-1 border border-transparent hover:border-primary-200 focus:border-primary-500 rounded bg-transparent text-right focus:bg-surface"
                                                            />
                                                            <span className="text-ink-faint">€</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={allSelected}
                                                            onChange={e => toggleAllParticipants(idx, e.target.checked)}
                                                            className={cn('w-5 h-5 rounded border-2 border-hairline-strong text-primary-600 focus:ring-primary-500 cursor-pointer', locked && 'opacity-40')}
                                                        />
                                                    </td>
                                                    {split.participants.map(p => (
                                                        <td key={p} className="px-2 py-2 text-center">
                                                            {itemMode === 'equal' ? (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.participants.includes(p)}
                                                                    onChange={() => toggleParticipant(idx, p)}
                                                                    className={cn('w-5 h-5 rounded border-2 border-hairline-strong text-primary-600 focus:ring-primary-500 cursor-pointer', locked && 'opacity-40')}
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
                                                                    <Money value={computeParticipantAmount(item, p)} />
                                                                </button>
                                                            ) : (
                                                                <span className="text-ink-faint">—</span>
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="px-2 py-2 text-center">
                                                        <div className="flex items-center justify-center gap-0.5">
                                                            {renderItemLockButton(idx, locked)}
                                                            <button onClick={() => removeItem(idx)} className="p-1.5 text-danger hover:bg-danger-bg rounded-full transition-colors" title="Remover item">
                                                                <Icon name="delete_outline" className="text-base" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-bold text-primary-600 text-base">
                                                        {itemMode === 'equal'
                                                            ? <Money value={perPerson} />
                                                            : getItemModeShortLabel(item)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-surface-sunken">
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
                                            <td className="px-3 py-2 text-right font-black text-lg"><Money value={grandTotal} /></td>
                                            <td className="px-2 py-2"></td>
                                            {split.participants.map(p => (
                                                <td key={p} className="px-2 py-2 text-center font-black text-base">
                                                    <Money value={totals[p] || 0} />
                                                </td>
                                            ))}
                                            <td className="px-2 py-2"></td>
                                            <td className="px-3 py-2 text-right font-black text-lg"><Money value={grandTotal} /></td>
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
