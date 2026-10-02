'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useSmartRouter } from '@/hooks/useSmartRouter';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { expensesApi, placeholdersApi, splitsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { useExpense, useParties, usePlaceholders, useSplit } from '@/lib/db/hooks';
import { assertOnline, isConflictError, optimisticDelete, optimisticEdit, mutationErrorMessage } from '@/lib/db/mutations';
import { notifyEvent } from '@/lib/notify';
import { navStart } from '@/lib/navProgress';
import type { Party, Split, SplitItem } from '@/lib/types';
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
import { SplitItemSheet } from '@/components/features/SplitItemSheet';
import { Sheet } from '@/components/ui/Sheet';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { Button } from '@/components/ui/Button';
import {
    computeParticipantAmount,
    getActiveParticipants,
    getItemModeShortLabel,
    getSplitItemMode,
    removeParticipantFromItem,
} from '@/lib/splitItemAllocation';
import {
    calculateExportGrandTotal,
    calculateSplitTotals,
} from '@/lib/splitShare';
import {
    findPlaceholderByName,
    partiesNotIn,
    partyAvatarUrl,
    partyLabel,
} from '@/lib/parties';
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
import { formatEUR, formatPriceInput, parseEUR } from '@/lib/money';
import { fromCents, toCents } from '@/lib/ledger/money';
import { itemizedLedger } from '@/lib/ledger/shares';
import { PayerPickerSheet } from '@/components/features/PayerPickerSheet';
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

export default function SplitItemsPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const expenseId = params.expenseId as string;
    const router = useSmartRouter();
    const { user, isLoggedIn, updateProfile } = useUser();
    const { isAdmin } = useGroup();
    const { showToast } = useToast();
    const confirmAction = useConfirm();
    const { startTimer } = useEditTimer();
    const shareRef = useRef<HTMLDivElement>(null);
    const participantInputDesktopRef = useRef<HTMLInputElement>(null);
    const participantInputMobileRef = useRef<HTMLInputElement>(null);

    // Este ecrã é o editor de itens de uma despesa itemizada — o `Split` por
    // trás é um detalhe de implementação (histórico do modo de divisão por
    // item, link partilhado, scan de fatura). `expense.split_id` liga um ao
    // outro; o total/partes da despesa derivam dos itens (ver efeito abaixo).
    const expense = useExpense(expenseId);
    const splitId = expense?.split_id;
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
        expense === undefined ||
        (expense && liveSplit === undefined) ||
        (split === null && liveSplit !== null);
    const [newParticipant, setNewParticipant] = useState('');
    const [totalsExpanded, setTotalsExpanded] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [showInviteSheet, setShowInviteSheet] = useState(false);
    const [showAllowedModesSheet, setShowAllowedModesSheet] = useState(false);
    const [showScanSheet, setShowScanSheet] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    /** Folha de item aberta: `index: null` = item novo. */
    const [itemSheet, setItemSheet] = useState<{ index: number | null } | null>(null);
    const [showParticipantsSheet, setShowParticipantsSheet] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    // Item trancado + toque num participante → treme o cadeado ("está fixo").
    const [shakeLockIdx, setShakeLockIdx] = useState<number | null>(null);
    const bumpLockShake = (idx: number) => {
        setShakeLockIdx(idx);
        setTimeout(() => setShakeLockIdx((cur) => (cur === idx ? null : cur)), 450);
    };

    const parties = useParties(groupId);
    const placeholders = usePlaceholders(groupId);
    const partiesMap = useMemo(() => parties ?? new Map<string, Party>(), [parties]);

    const participantAvatar = useCallback(
        (id: string) => partyAvatarUrl(id, partiesMap),
        [partiesMap]
    );
    const participantLabel = useCallback(
        (id: string) => partyLabel(id, partiesMap),
        [partiesMap]
    );
    /** Só um placeholder ainda não reclamado tem nome editável aqui — o de um
     *  membro com conta vem do perfil dele. */
    const isEditableParticipant = useCallback(
        (id: string) => {
            const party = partiesMap.get(id);
            return party?.kind === 'placeholder' && !party.claimedBy;
        },
        [partiesMap]
    );

    const partiesToAdd = useMemo(
        () => partiesNotIn(partiesMap, split?.participants ?? []),
        [partiesMap, split?.participants]
    );

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

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

    // O total/partes da despesa derivam sempre dos itens — sempre que o split
    // muda (itens/participantes), recalcula e grava na despesa ligada. A
    // comparação com o que já lá está evita escritas redundantes (e um loop
    // com o eco do realtime).
    //
    // Tudo em cêntimos (`itemizedLedger`): Σ partes = Σ pagadores = total, a
    // invariante que o servidor exige. Sem itens atribuídos ainda não há total
    // (o PB rejeita `amount = 0`) — a despesa fica com o valor do formulário
    // até haver o primeiro item com participantes.
    const itemsLedger = useMemo(() => {
        if (!expense || !split) return null;
        const ledger = itemizedLedger(
            calculateSplitTotals(split),
            calculateExportGrandTotal(split.items),
            expense.payers,
        );
        return ledger.amountCents > 0 ? ledger : null;
    }, [expense, split]);

    // Vários pagadores e o total mudou: NÃO se grava nada (nem total, nem
    // partes) até alguém reatribuir quem pagou o novo total — ver o aviso e o
    // `PayerPickerSheet` no render.
    const payersNeedReassign = !!itemsLedger && !itemsLedger.payersMatch;
    const [showPayerSheet, setShowPayerSheet] = useState(false);

    const saveItemsLedger = useCallback(
        async (
            payers: { party: string; amount: number }[],
            opts: { manual?: boolean } = {},
        ): Promise<'ok' | 'conflict' | 'error'> => {
            if (!expense || !itemsLedger || !user?.id) return 'error';
            const amount = fromCents(itemsLedger.amountCents);
            const shares = itemsLedger.shares.map((s) => ({ party: s.party, amount: fromCents(s.amountCents) }));
            try {
                const updated = await expensesApi.update(expense.id, { amount, shares, payers }, user.id, {
                    expectedUpdated: expense.updated,
                });
                await db.expenses.put(updated);
                return 'ok';
            } catch (err) {
                if (isConflictError(err)) {
                    // Alguém gravou a despesa entretanto. A sincronização
                    // automática volta a correr sozinha quando a versão nova
                    // chegar (é derivada dos itens); só a reatribuição manual
                    // de pagadores precisa de avisar.
                    if (opts.manual) showToast('A despesa foi alterada entretanto. Revê quem pagou e tenta outra vez.', 'error');
                    return 'conflict';
                }
                console.error('[expense] falha ao sincronizar total dos itens', err);
                showToast(mutationErrorMessage(err, 'Erro ao atualizar o total da despesa'), 'error');
                return 'error';
            }
        },
        [expense, itemsLedger, user?.id, showToast],
    );

    // No máximo UMA gravação automática por versão da despesa: enquanto o PATCH
    // está no ar chegam mais renders do mesmo split (otimista, eco do realtime)
    // ainda com a despesa antiga — cada um voltava a gravar a partir da mesma
    // versão, e com o controlo de concorrência esses duplicados davam 409.
    // Quando a versão nova chega (realtime / resposta), o efeito volta a
    // comparar e só grava se ainda houver diferença.
    const syncedFromVersion = useRef<string | null>(null);

    useEffect(() => {
        if (!expense || !itemsLedger || !itemsLedger.payersMatch) return;

        const shares = itemsLedger.shares.map((s) => ({ party: s.party, amount: fromCents(s.amountCents) }));
        const payers = itemsLedger.payerCents.map((p) => ({ party: p.party, amount: fromCents(p.amountCents) }));

        const sameLines = (a: { party: string; amount: number }[], b: { party: string; amount: number }[]) =>
            a.length === b.length &&
            a.every((line) => b.some((o) => o.party === line.party && toCents(o.amount) === toCents(line.amount)));
        if (
            toCents(expense.amount) === itemsLedger.amountCents &&
            sameLines(shares, expense.shares) &&
            sameLines(payers, expense.payers)
        ) {
            return;
        }

        if (syncedFromVersion.current === expense.updated) return;
        syncedFromVersion.current = expense.updated;
        void saveItemsLedger(payers).then((result) => {
            // Erro de rede/servidor: liberta para voltar a tentar na próxima
            // mudança. Conflito: a versão nova vem a caminho e desbloqueia.
            if (result === 'error') syncedFromVersion.current = null;
        });
    }, [expense, itemsLedger, saveItemsLedger]);

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
        const id = base.id;
        const previousSplit = JSON.parse(JSON.stringify(base));

        if (!mutator) {
            setSplit({ ...base, ...updatedFields });
            if (!saving) setSaving(true);
            try {
                await splitsApi.update(id, updatedFields);
                await db.splits.update(id, updatedFields);
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
                        id,
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
                        baseSplit = await splitsApi.getById(id);
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
                const fresh = await splitsApi.getById(id);
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
                'Outras pessoas estavam a alterar esta divisão. Atualizei os dados: confirma e tenta outra vez.',
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

    const addParticipantById = async (partyId: string) => {
        if (!split) return;
        if (split.participants.includes(partyId)) {
            showToast('Já existe', 'error');
            return;
        }
        await saveSplit({ participants: [...split.participants, partyId] });
        setNewParticipant('');
    };

    /** Nome sem correspondência entre as partes do grupo — cria um placeholder
     *  (membro sem conta) e junta-o à divisão. Reaproveita um placeholder já
     *  existente com o mesmo nome em vez de duplicar. */
    const addNewParticipant = async (name: string) => {
        if (!split || !user) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            assertOnline();
            const existing = findPlaceholderByName(trimmed, placeholders ?? []);
            const placeholder =
                existing ??
                (await placeholdersApi.create({
                    group_id: groupId,
                    name: trimmed,
                    created_by: user.id,
                }));
            if (!existing) await db.placeholders.put(placeholder);
            await addParticipantById(placeholder.id);
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao adicionar participante'), 'error');
        }
    };

    /** Só faz sentido para um placeholder (membro sem conta) — o nome de um
     *  membro com conta vem do perfil dele, não se edita aqui. */
    const renamePlaceholder = async (placeholderId: string, newName: string) => {
        const trimmed = newName.trim();
        const party = partiesMap.get(placeholderId);
        if (!trimmed || !party || party.kind !== 'placeholder' || trimmed === party.name) return;
        try {
            await optimisticEdit({
                table: db.placeholders,
                id: placeholderId,
                patch: { name: trimmed },
                commit: () => placeholdersApi.rename(placeholderId, trimmed),
            });
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao atualizar nome'), 'error');
        }
    };

    const focusParticipantInput = () => {
        const el =
            typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
                ? participantInputDesktopRef.current
                : participantInputMobileRef.current;
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el?.focus();
    };

    const removeParticipant = async (partyId: string) => {
        if (!split || split.participants.length <= 1) return;
        if (!(await confirmAction({
            title: `Remover ${participantLabel(partyId)}?`,
            tone: 'danger',
            confirmLabel: 'Remover',
        }))) return;

        const nextParticipants = split.participants.filter((p) => p !== partyId);
        await saveSplitItems(
            (items) =>
                items.map((item) =>
                    reconcileItemLock(removeParticipantFromItem(item, partyId), nextParticipants),
                ),
            { participants: nextParticipants },
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
            setItemSheet({ index: itemIdx });
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

    /** Guarda o item da `SplitItemSheet` — `index: null` acrescenta um novo. */
    const handleSaveItem = async (updatedItem: SplitItem, index: number | null) => {
        if (!split) return;
        await saveSplitItems((items) => {
            const next = cloneSplitItems(items);
            const reconciled = reconcileItemLock(updatedItem, split.participants);
            if (index === null) next.push(reconciled);
            else if (next[index]) next[index] = reconciled;
            return next;
        });
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
        if (!splitId || !expense || !user?.id) return;
        if (!(await confirmAction({
            title: 'Eliminar esta despesa?',
            tone: 'danger',
            confirmLabel: 'Eliminar',
        }))) return;
        try {
            // Apagar só o split deixava a despesa "itemizada" a apontar para
            // nada — a despesa é que é a unidade real agora, o split é só o
            // editor de itens por trás dela.
            const updatedExpense = await expensesApi.softDelete(expense.id, user.id);
            await db.expenses.put(updatedExpense);
            await optimisticDelete({
                table: db.splits,
                id: splitId,
                commit: () => splitsApi.delete(splitId),
            });
            showToast('Despesa eliminada', 'success');
            notifyEvent('expense.deleted', updatedExpense.id);
            navStart();
            router.push(`/groups/${groupId}/expenses`);
        } catch (err) {
            showToast(mutationErrorMessage(err, 'Erro ao eliminar'), 'error');
        }
    };

    if (!isLoggedIn) return null;
    if (loading) {
        return (
            <div className="min-h-screen bg-app">
                <Header showBack title="Itens" />
                <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
            </div>
        );
    }

    if (!split) {
        return (
            <div className="min-h-screen bg-app">
                <Header showBack title="Itens" />
                <div className="text-center py-20">
                    <div className="text-5xl mb-4">🔍</div>
                    <h2 className="text-xl font-bold mb-2">Não encontrei os itens desta despesa</h2>
                    <button onClick={() => { navStart(); router.push(`/groups/${groupId}/expenses`); }} className="btn btn-primary px-6 py-2 mt-4">Voltar</button>
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
    const unassignedCount = split.items.filter((i) => getActiveParticipants(i).length === 0).length;

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
            title={locked ? 'Desbloquear (qualquer pessoa pode entrar ou sair deste item)' : 'Bloquear (fixa quem participa neste item)'}
        >
            <Icon
                name={locked ? 'lock' : 'lock_open'}
                className={cn('text-[20px]', shakeLockIdx === itemIdx && 'lock-shake')}
            />
        </button>
    );

    return (
        <div className="min-h-screen bg-app pb-32 md:pb-8">
            <Header
                showBack
                title="Itens"
                subtitle={split.name}
                actions={
                    <button
                        type="button"
                        onClick={() => setShowMenu(true)}
                        aria-label="Mais ações da divisão"
                        className="lg:hidden w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-surface-sunken"
                    >
                        <Icon name="more_horiz" className="text-xl" />
                    </button>
                }
            />

            {payersNeedReassign && itemsLedger && expense && (
                <div role="alert" className="mx-4 mt-3 rounded-2xl bg-warning-bg text-warning-fg px-4 py-3 flex items-start gap-3">
                    <Icon name="warning" className="shrink-0 mt-0.5" size={20} />
                    <div className="flex-1 min-w-0 text-sm">
                        <p className="font-semibold">
                            O total passou para {formatEUR(fromCents(itemsLedger.amountCents))}
                        </p>
                        <p>
                            Quem pagou soma {formatEUR(fromCents(itemsLedger.payerCents.reduce((sum, p) => sum + p.amountCents, 0)))}.
                            A despesa só é atualizada depois de reatribuíres quem pagou.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowPayerSheet(true)}
                            className="mt-2 font-semibold underline underline-offset-2"
                        >
                            Reatribuir quem pagou
                        </button>
                    </div>
                </div>
            )}
            {itemsLedger && expense && (
                <PayerPickerSheet
                    isOpen={showPayerSheet}
                    onClose={() => setShowPayerSheet(false)}
                    parties={Array.from(partiesMap.values())}
                    totalAmount={fromCents(itemsLedger.amountCents)}
                    payers={expense.payers}
                    onConfirm={(payers) => void saveItemsLedger(payers, { manual: true })}
                />
            )}

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
                            onSelectExisting={(id) => void addParticipantById(id)}
                            onAddNew={(name) => void addNewParticipant(name)}
                            candidates={partiesToAdd}
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
                                                    <Avatar name={participantLabel(p)} src={participantAvatar(p)} size="sm" className="mb-1" />
                                                    {isEditableParticipant(p) ? (
                                                        <EditableInput
                                                            type="text"
                                                            value={participantLabel(p)}
                                                            onSave={val => renamePlaceholder(p, val)}
                                                            className="w-full text-center bg-transparent border-0 focus:outline-none focus:bg-white/20 rounded px-1 text-xs font-medium"
                                                        />
                                                    ) : (
                                                        <span className="w-full text-center px-1 text-xs font-medium truncate">
                                                            {participantLabel(p)}
                                                        </span>
                                                    )}
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
                                                        onClick={() => setItemSheet({ index: idx })}
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
                                                                onClick={() => setItemSheet({ index: idx })}
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
            {/* Mobile (Fase 15): lista de itens só de leitura — editar um item
                (nome, preço, quem consumiu) é na folha `SplitItemSheet`; gerir
                participantes, numa folha própria; link/modos/fechar, no "⋯"
                do cabeçalho. Antes estava tudo expandido ao mesmo tempo. */}
            <main className="lg:hidden container mx-auto px-4 py-4 max-w-2xl space-y-4">
                <button
                    type="button"
                    onClick={() => setShowParticipantsSheet(true)}
                    className="card w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                    <AvatarStack
                        people={split.participants.map((p) => ({ id: p, name: participantLabel(p), src: participantAvatar(p) }))}
                        max={4}
                        size="sm"
                    />
                    <span className="flex-1 min-w-0 text-sm text-ink-soft truncate">
                        <span className="font-semibold text-ink">{split.participants.length}</span>{' '}
                        {split.participants.length === 1 ? 'participante' : 'participantes'}
                    </span>
                    <span className="shrink-0 flex items-center text-sm font-semibold text-primary-600 dark:text-primary-400">
                        Gerir <Icon name="chevron_right" className="text-lg" />
                    </span>
                </button>

                <section>
                    <div className="flex items-baseline gap-2 px-1 mb-2">
                        <h2 className="font-semibold text-ink">Itens</h2>
                        <span className="text-sm text-ink-faint">{split.items.length}</span>
                    </div>
                    {split.items.length === 0 ? (
                        <p className="card px-4 py-6 text-center text-sm text-ink-soft">
                            Ainda não há itens. Adiciona-os à mão ou lê a fatura.
                        </p>
                    ) : (
                        <div className="card divide-y divide-hairline overflow-hidden">
                            {split.items.map((item, idx) => {
                                const itemMode = getSplitItemMode(item);
                                const active = getActiveParticipants(item);
                                const everyone = split.participants.length > 0 && active.length === split.participants.length;
                                const perPerson = itemMode === 'equal' && active.length > 0 ? item.price / active.length : 0;
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setItemSheet({ index: idx })}
                                        className="w-full px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <p className={cn('flex-1 min-w-0 truncate font-semibold', item.name ? 'text-ink' : 'text-ink-faint')}>
                                                {item.name || 'Item sem nome'}
                                            </p>
                                            {isItemLocked(item) && (
                                                <Icon name="lock" className="text-sm text-ink-faint shrink-0" aria-label="Participantes fixos" />
                                            )}
                                            <Money value={item.price} className="font-semibold text-ink shrink-0" />
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 min-w-0 text-xs text-ink-soft">
                                            {active.length === 0 ? (
                                                <span className="flex items-center gap-1 font-medium text-warning-fg">
                                                    <Icon name="warning" className="text-sm" />
                                                    Ninguém atribuído
                                                </span>
                                            ) : (
                                                <>
                                                    {!everyone && (
                                                        <AvatarStack
                                                            people={active.map((p) => ({ id: p, name: participantLabel(p), src: participantAvatar(p) }))}
                                                            max={4}
                                                        />
                                                    )}
                                                    <span className="truncate">
                                                        {everyone ? 'Todos' : `${active.length} ${active.length === 1 ? 'pessoa' : 'pessoas'}`}
                                                        {itemMode === 'equal' ? (
                                                            <> · <Money value={perPerson} />/pessoa</>
                                                        ) : (
                                                            ` · ${getItemModeShortLabel(item)}`
                                                        )}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                <div className="flex gap-2">
                    <Button variant="secondary" block className="whitespace-nowrap" onClick={() => setItemSheet({ index: null })}>
                        <Icon name="add" className="text-lg" /> Novo item
                    </Button>
                    <Button variant="secondary" block className="whitespace-nowrap" onClick={() => setShowScanSheet(true)}>
                        <Icon name="receipt_long" className="text-lg" /> Ler fatura
                    </Button>
                </div>
            </main>

            {/* Barra de totais — a única barra fixa em baixo: a barra global
                não aparece neste ecrã de tarefa (ver o layout do grupo). */}
            <div className="lg:hidden fixed inset-x-0 bottom-0 bg-surface border-t border-hairline shadow-lg z-40 safe-bottom-nav">
                <button onClick={() => setTotalsExpanded(!totalsExpanded)} className="w-full px-4 py-3 flex items-center justify-between">
                    <span className="text-left">
                        <span className="block font-semibold text-ink">Total</span>
                        {unassignedCount > 0 && (
                            <span className="block text-xs font-medium text-warning-fg">
                                {unassignedCount} {unassignedCount === 1 ? 'item' : 'itens'} por atribuir
                            </span>
                        )}
                    </span>
                    <span className="flex items-center gap-2">
                        <Money value={grandTotal} className="text-lg font-bold text-ink" />
                        <Icon name="keyboard_arrow_up" className={cn("text-xl text-ink-faint transition-transform", totalsExpanded && "rotate-180")} />
                    </span>
                </button>
                <Collapse open={totalsExpanded}>
                    <div className="px-4 pb-3 border-t border-hairline bg-surface">
                        <div className="py-2 text-sm space-y-1">
                            {sortedTotals.map(([id, amount]) => (
                                <div key={id} className="flex justify-between">
                                    <span className="text-ink-soft">{participantLabel(id)}</span>
                                    <Money value={amount} className="font-medium text-ink" />
                                </div>
                            ))}
                        </div>
                        <Button block size="sm" onClick={handleShare} loading={sharing} className="mt-2">
                            <Icon name="share" className="text-base" /> Partilhar imagem
                        </Button>
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
                        {sortedTotals.map(([id, amount]) => (
                            <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                                <span style={{ color: '#374151' }}>{participantLabel(id)}</span>
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
                                                        <Avatar name={participantLabel(p)} src={participantAvatar(p)} size="sm" className="mb-1" />
                                                        <span className="text-xs font-medium truncate max-w-[90px]">{participantLabel(p)}</span>
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
                                                                setItemSheet({ index: idx });
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
                                                                        setItemSheet({ index: idx });
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

            <SplitItemSheet
                isOpen={itemSheet !== null}
                onClose={() => setItemSheet(null)}
                itemIndex={itemSheet?.index ?? null}
                item={itemSheet?.index != null ? split.items[itemSheet.index] ?? null : null}
                allParticipants={split.participants}
                parties={partiesMap}
                onSave={(item) => void handleSaveItem(item, itemSheet?.index ?? null)}
                onDelete={itemSheet?.index != null ? () => void removeItem(itemSheet.index as number) : undefined}
            />

            <Sheet
                isOpen={showParticipantsSheet}
                onClose={() => setShowParticipantsSheet(false)}
                title="Participantes"
                subtitle={`${split.participants.length} na divisão`}
                size="large"
            >
                <div className="px-1">
                    <SplitParticipantNameInput
                        value={newParticipant}
                        onChange={setNewParticipant}
                        onSelectExisting={(id) => void addParticipantById(id)}
                        onAddNew={(name) => void addNewParticipant(name)}
                        candidates={partiesToAdd}
                        inputRef={participantInputMobileRef}
                    />
                    <ul className="mt-3 divide-y divide-hairline">
                        {split.participants.map((p) => (
                            <li key={p} className="flex items-center gap-3 py-2.5">
                                <Avatar name={participantLabel(p)} src={participantAvatar(p)} size="sm" />
                                <span className="flex-1 min-w-0 font-medium text-ink truncate">{participantLabel(p)}</span>
                                {split.participants.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => void removeParticipant(p)}
                                        aria-label={`Remover ${participantLabel(p)}`}
                                        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-ink-faint hover:text-danger-fg hover:bg-danger-bg transition-colors"
                                    >
                                        <Icon name="close" className="text-lg" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </Sheet>

            <ActionSheet
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                title={split.name || 'Divisão'}
                actions={[
                    {
                        icon: 'link',
                        label: 'Convidar a marcar',
                        onSelect: () => setShowInviteSheet(true),
                        disabled: splitClosed,
                    },
                    { icon: 'tune', label: 'Modos de divisão permitidos', onSelect: () => setShowAllowedModesSheet(true) },
                    {
                        icon: splitClosed ? 'lock_open' : 'lock',
                        label: splitClosed ? 'Reabrir divisão' : 'Fechar divisão',
                        onSelect: () => void setSplitStatus(!splitClosed),
                    },
                ]}
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
