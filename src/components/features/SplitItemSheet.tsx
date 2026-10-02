'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
    computeAllocationSummary,
    computeParticipantAmount,
    getSplitItemMode,
    migrateItemToMode,
    normalizeSplitItem,
} from '@/lib/splitItemAllocation';
import { isItemLocked, setItemLocked } from '@/lib/splitItems';
import { formatEUR, formatPriceInput, parseEUR, PRICE_PLACEHOLDER } from '@/lib/money';
import { partyAvatarUrl, partyLabel } from '@/lib/parties';
import type { Party, SplitItem, SplitItemMode } from '@/lib/types';
import { cn } from '@/lib/utils';

const MODE_ITEMS: { key: SplitItemMode; label: string }[] = [
    { key: 'equal', label: 'Igual' },
    { key: 'unequal', label: 'Exato' },
    { key: 'percentage', label: '%' },
    { key: 'shares', label: 'Quantidade' },
];

const EMPTY_ITEM: SplitItem = { name: '', price: 0, participants: [], locked: false };

interface SplitItemSheetProps {
    isOpen: boolean;
    onClose: () => void;
    /** `null` = item novo. */
    item: SplitItem | null;
    /** Identidade do item a editar (`null` = novo) — o rascunho só é
     *  reposto quando isto muda, não a cada eco do realtime (que troca o
     *  objeto `item` e apagaria o que se está a escrever). */
    itemIndex: number | null;
    allParticipants: string[];
    parties: Map<string, Party>;
    /** `addAnother` — o utilizador quer lançar já o item seguinte (a folha
     *  fica aberta com um item em branco). */
    onSave: (item: SplitItem, opts: { addAnother: boolean }) => void;
    /** Só para itens existentes. */
    onDelete?: () => void;
}

/**
 * Editor de um item de uma despesa por itens (Fase 15) — nome, preço, modo e
 * quem consumiu, tudo numa folha em vez de controlos empilhados em cada cartão
 * da lista (campos de nome curtos, cadeado, lixo, "Dividir com", chips de 13
 * pessoas por item). A lista fica só de leitura; tocar numa linha abre isto.
 * Quem consumiu é uma lista com caixas de 24px (como "Pago por"), não chips.
 */
export function SplitItemSheet({
    isOpen,
    onClose,
    item,
    itemIndex,
    allParticipants,
    parties,
    onSave,
    onDelete,
}: SplitItemSheetProps) {
    const [draft, setDraft] = useState<SplitItem>(EMPTY_ITEM);
    const [priceText, setPriceText] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);
    const isNew = item === null;

    const resetTo = (next: SplitItem) => {
        setDraft(normalizeSplitItem(next, allParticipants));
        setPriceText(next.price ? formatPriceInput(next.price) : '');
    };

    useEffect(() => {
        if (!isOpen) return;
        resetTo(item ?? EMPTY_ITEM);
        // Item novo: foco no nome — é o que se escreve primeiro.
        if (!item) window.setTimeout(() => nameRef.current?.focus(), 350);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, itemIndex]);

    const mode = getSplitItemMode(draft);
    const locked = isItemLocked(draft);
    const summary = useMemo(() => computeAllocationSummary(draft), [draft]);
    const label = (id: string) => partyLabel(id, parties);
    const avatar = (id: string) => partyAvatarUrl(id, parties);

    const hasContent = draft.name.trim() !== '' || draft.price > 0;
    // Um item "Igual" sem ninguém é válido — fica por atribuir (a lista avisa).
    // Nos outros modos os valores têm de bater certo com o preço.
    const canSave = hasContent && (mode === 'equal' || summary.isValid);

    const setPrice = (raw: string) => {
        setPriceText(raw);
        setDraft((d) => ({ ...d, price: parseEUR(raw) }));
    };

    const toggleParticipant = (id: string) => {
        setDraft((d) => {
            const selected = new Set(d.participants);
            if (selected.has(id)) selected.delete(id);
            else selected.add(id);
            return { ...d, split_mode: 'equal', participants: Array.from(selected), allocations: undefined };
        });
    };

    const allSelected = mode === 'equal' && allParticipants.length > 0 && draft.participants.length === allParticipants.length;
    const setAll = (checked: boolean) =>
        setDraft((d) => ({ ...d, split_mode: 'equal', participants: checked ? [...allParticipants] : [], allocations: undefined }));

    const setAllocationValue = (id: string, raw: string) => {
        const parsed = raw === '' ? 0 : Number.parseFloat(raw);
        const value = Number.isFinite(parsed) ? parsed : 0;
        setDraft((d) => {
            const allocations = { ...(d.allocations ?? {}), [id]: value };
            return { ...d, allocations, participants: allParticipants.filter((p) => (allocations[p] ?? 0) > 0) };
        });
    };

    const save = (addAnother: boolean) => {
        if (!canSave) return;
        onSave({ ...normalizeSplitItem(draft, allParticipants), name: draft.name.trim() }, { addAnother });
        if (addAnother) {
            resetTo(EMPTY_ITEM);
            nameRef.current?.focus();
        } else {
            onClose();
        }
    };

    const perPerson = mode === 'equal' && draft.participants.length > 0 ? draft.price / draft.participants.length : 0;

    const summaryText = () => {
        if (mode === 'equal') {
            const n = draft.participants.length;
            return n === 0
                ? 'Ninguém escolhido. O item fica por atribuir.'
                : `${formatEUR(draft.price)} a dividir por ${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
        }
        if (mode === 'percentage') {
            return summary.isValid ? '100% atribuído' : `${Math.abs(summary.remaining).toFixed(0)}% em falta`;
        }
        if (mode === 'shares') {
            return summary.assigned > 0
                ? `${summary.assigned} ${summary.assigned === 1 ? 'unidade' : 'unidades'} no total`
                : 'Indica quantas unidades cada pessoa consumiu.';
        }
        return summary.isValid ? 'Total atribuído' : `${formatEUR(Math.abs(summary.remaining))} em falta`;
    };

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title={isNew ? 'Novo item' : 'Editar item'}
            size="full"
            minimizedAboveBottomNav={false}
            footer={
                <div className="space-y-2">
                    <Button block size="lg" disabled={!canSave} onClick={() => save(false)}>
                        Guardar
                    </Button>
                    {isNew && (
                        <Button block variant="ghost" disabled={!canSave} onClick={() => save(true)}>
                            Guardar e adicionar outro
                        </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-5 px-1 pb-2">
                {/* Nome + preço — o nome ocupa a largura toda (era um campo
                    espremido entre o preço, o cadeado e o lixo). */}
                <div className="space-y-2">
                    <input
                        ref={nameRef}
                        type="text"
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Nome do item (ex.: Sangria)"
                        aria-label="Nome do item"
                        className="w-full px-4 py-3 rounded-xl border-2 border-hairline bg-surface-sunken text-base font-semibold text-ink placeholder:text-ink-faint placeholder:font-normal focus:outline-none focus:border-primary-500 focus:bg-surface"
                    />
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={priceText}
                            onChange={(e) => setPrice(e.target.value)}
                            onBlur={() => setPriceText(draft.price ? formatPriceInput(draft.price) : '')}
                            placeholder={PRICE_PLACEHOLDER}
                            aria-label="Preço do item"
                            className="w-full pl-4 pr-10 py-3 rounded-xl border-2 border-hairline bg-surface-sunken text-base font-semibold text-ink tabular-nums placeholder:text-ink-faint placeholder:font-normal focus:outline-none focus:border-primary-500 focus:bg-surface"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint font-medium">€</span>
                    </div>
                </div>

                <SegmentedControl
                    ariaLabel="Como dividir este item"
                    items={MODE_ITEMS}
                    value={mode}
                    onChange={(next) => setDraft((d) => migrateItemToMode(d, next, allParticipants))}
                />

                {/* Fixar participantes — o antigo cadeado, agora com texto a
                    dizer o que faz (antes só a dica do rato explicava). */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={locked}
                    onClick={() => setDraft((d) => setItemLocked(d, !locked))}
                    className="w-full flex items-center gap-3 text-left"
                >
                    <Icon name={locked ? 'lock' : 'lock_open'} className="text-xl text-ink-soft shrink-0" />
                    <span className="flex-1 min-w-0">
                        <span className="block font-medium text-ink">Fixar participantes</span>
                        <span className="block text-xs text-ink-faint">
                            Ninguém entra nem sai deste item pelo link de marcação.
                        </span>
                    </span>
                    <span
                        className={cn(
                            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                            locked ? 'bg-primary-600' : 'bg-hairline-strong',
                        )}
                    >
                        <span className={cn('inline-block h-4 w-4 rounded-full bg-surface transition-transform ml-1', locked && 'translate-x-5')} />
                    </span>
                </button>

                <section>
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">Quem consumiu</h3>
                        {mode === 'equal' && !locked && (
                            <button
                                type="button"
                                onClick={() => setAll(!allSelected)}
                                className="text-sm font-semibold text-primary-600 dark:text-primary-400"
                            >
                                {allSelected ? 'Ninguém' : 'Todos'}
                            </button>
                        )}
                    </div>
                    {locked && (
                        <p className="text-xs text-ink-faint mb-1">Desliga “Fixar participantes” para alterar.</p>
                    )}

                    <ul className={cn('divide-y divide-hairline', locked && 'opacity-60')}>
                        {allParticipants.map((id) => {
                            if (mode === 'equal') {
                                const checked = draft.participants.includes(id);
                                return (
                                    <li key={id}>
                                        <button
                                            type="button"
                                            disabled={locked}
                                            onClick={() => toggleParticipant(id)}
                                            aria-pressed={checked}
                                            className="w-full flex items-center gap-3 py-2.5 text-left"
                                        >
                                            <Avatar name={label(id)} src={avatar(id)} size="sm" />
                                            <span className="flex-1 min-w-0 font-medium text-ink truncate">{label(id)}</span>
                                            {checked && perPerson > 0 && (
                                                <Money value={perPerson} className="text-sm text-ink-soft" />
                                            )}
                                            <span
                                                className={cn(
                                                    'w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                                                    checked ? 'bg-primary-600 border-primary-600 text-white' : 'border-hairline-strong',
                                                )}
                                            >
                                                {checked && <Icon name="check" className="text-sm" strokeWidth={3} />}
                                            </span>
                                        </button>
                                    </li>
                                );
                            }
                            const value = draft.allocations?.[id] ?? 0;
                            const suffix = mode === 'unequal' ? '€' : mode === 'percentage' ? '%' : 'un.';
                            return (
                                <li key={id} className={cn('flex items-center gap-3 py-2.5', value <= 0 && 'opacity-60')}>
                                    <Avatar name={label(id)} src={avatar(id)} size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-ink truncate">{label(id)}</p>
                                        {value > 0 && mode !== 'unequal' && (
                                            <Money value={computeParticipantAmount(draft, id)} className="text-xs text-ink-soft" />
                                        )}
                                    </div>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step={mode === 'unequal' ? 0.01 : 1}
                                        disabled={locked}
                                        value={value === 0 ? '' : value}
                                        onChange={(e) => setAllocationValue(id, e.target.value)}
                                        placeholder="0"
                                        aria-label={`Valor de ${label(id)}`}
                                        className="w-20 text-right text-base font-semibold bg-transparent border-b-2 border-hairline focus:border-primary-500 outline-none py-1 tabular-nums"
                                    />
                                    <span className="w-6 text-sm text-ink-faint">{suffix}</span>
                                </li>
                            );
                        })}
                    </ul>

                    <p
                        className={cn(
                            'mt-2 text-sm',
                            mode !== 'equal' && !summary.isValid ? 'text-warning-fg' : 'text-ink-soft',
                        )}
                    >
                        {summaryText()}
                    </p>
                </section>

                {!isNew && onDelete && (
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            onDelete();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 text-danger-fg font-semibold"
                    >
                        <Icon name="delete_outline" className="text-lg" />
                        Apagar item
                    </button>
                )}
            </div>
        </Sheet>
    );
}
