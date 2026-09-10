'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import {
  MEMBER_ALLOCATION_MODES,
  SPLIT_ITEM_MODE_LABELS,
  canMemberSaveAllocation,
  computeAllocationSummary,
  computeParticipantAmount,
  computePinnedUnequalAmounts,
  getActiveParticipants,
  getSplitItemMode,
  memberSheetDefaultMode,
  migrateItemToMode,
  normalizeSplitItem,
  roundMoney,
} from '@/lib/splitItemAllocation';
import { isItemLocked } from '@/lib/splitItems';
import type { Group, SplitItem, SplitItemMode } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import { getParticipantAvatarUrl } from '@/lib/splitShare';
import { Icon } from '@/components/ui/Icon';

interface SplitMemberItemAllocationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  itemIndex: number | null;
  item: SplitItem | null;
  allParticipants: string[];
  myName: string;
  group: Pick<Group, 'expand'> | null | undefined;
  onConfirm: (item: SplitItem) => void;
  /** When true, the sheet only shows who divides the item (no editing). */
  readOnly?: boolean;
  /** Which modes members may switch to. Defaults to all member modes. */
  allowedModes?: SplitItemMode[];
}

function seedValues(
  item: SplitItem,
  allParticipants: string[]
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of allParticipants) {
    const value = item.allocations?.[name] ?? 0;
    values[name] = value > 0 ? String(value) : '';
  }
  return values;
}

function parseValue(raw: string | undefined): number {
  const parsed = raw && raw !== '' ? Number.parseFloat(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function SplitMemberItemAllocationSheet({
  isOpen,
  onClose,
  itemIndex,
  item,
  allParticipants,
  myName,
  group,
  onConfirm,
  readOnly = false,
  allowedModes = MEMBER_ALLOCATION_MODES,
}: SplitMemberItemAllocationSheetProps) {
  const [draftMode, setDraftMode] = useState<SplitItemMode>('shares');
  const [equalParticipants, setEqualParticipants] = useState<Set<string>>(
    new Set()
  );
  const [values, setValues] = useState<Record<string, string>>({});
  // "Pinned" participants (unequal mode only): their amount is fixed by the
  // user, and the remaining price auto-splits evenly across everyone else.
  // Purely a UI helper — never persisted.
  const [pinnedNames, setPinnedNames] = useState<Set<string>>(new Set());
  // Name of the field currently focused — the "over max" hint only makes
  // sense for whichever field the user is actively typing into.
  const [focusedName, setFocusedName] = useState<string | null>(null);

  // Only seed draft state when the sheet opens or the user picks another item —
  // not when the parent refreshes the same item (e.g. share-link polling).
  useEffect(() => {
    if (!isOpen || itemIndex === null || !item) return;
    setDraftMode(memberSheetDefaultMode(item));
    setEqualParticipants(new Set(item.participants));
    const normalized = normalizeSplitItem(item, allParticipants);
    setValues(seedValues(normalized, allParticipants));
    setPinnedNames(new Set());
  }, [isOpen, itemIndex]);

  const toggleEqualParticipant = (name: string) => {
    if (locked) return;
    setEqualParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const togglePin = (name: string) => {
    const activeNames = allParticipants.filter(
      (n) => parseValue(values[n]) > 0 || pinnedNames.has(n)
    );

    setPinnedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        // Unlocking from "everyone locked" would leave exactly one person
        // unlocked (an ambiguous, unusable state) — release one more so at
        // least two people share the remainder.
        const stillUnlocked = activeNames.filter((n) => !next.has(n));
        if (stillUnlocked.length === 1) {
          const another = activeNames.find((n) => next.has(n));
          if (another) next.delete(another);
        }
      } else {
        next.add(name);
        // Locking this one would leave exactly one other person "unlocked"
        // — forced to take whatever remains, with nothing left to decide.
        // Lock that last one too instead of leaving it stranded.
        const stillUnlocked = activeNames.filter((n) => !next.has(n));
        if (stillUnlocked.length === 1) {
          next.add(stillUnlocked[0]);
        }
      }
      return next;
    });
  };

  // Highest value this field could take right now without pushing anyone
  // else's share below zero — used to warn the user in real time.
  const maxAllowedForUnequal = (name: string): number | null => {
    if (!item || draftMode !== 'unequal') return null;
    if (pinnedNames.size > 0) {
      if (!pinnedNames.has(name)) return null;
      const otherPinnedSum = allParticipants
        .filter((n) => n !== name && pinnedNames.has(n))
        .reduce((sum, n) => sum + parseValue(values[n]), 0);
      return roundMoney(item.price - otherPinnedSum);
    }
    const otherSum = allParticipants
      .filter((n) => n !== name)
      .reduce((sum, n) => sum + parseValue(values[n]), 0);
    return roundMoney(item.price - otherSum);
  };

  // Whether this field's current value blows past what's actually left to
  // assign — used to trap focus there until the user fixes it.
  const isValueOverMax = (name: string): boolean => {
    if (draftMode !== 'unequal') return false;
    const hasAnyPin = pinnedNames.size > 0;
    const inputDisabled = hasAnyPin && !pinnedNames.has(name);
    if (inputDisabled) return false;
    const maxAllowed = maxAllowedForUnequal(name);
    return maxAllowed !== null && parseValue(values[name]) > maxAllowed + 0.005;
  };

  const unequalAutoAmounts = useMemo(() => {
    if (!item || draftMode !== 'unequal') return null;
    const rawValues: Record<string, number> = {};
    for (const name of allParticipants) {
      rawValues[name] = parseValue(values[name]);
    }
    return computePinnedUnequalAmounts(
      item.price,
      allParticipants,
      rawValues,
      pinnedNames
    );
  }, [item, draftMode, allParticipants, values, pinnedNames]);

  const draftItem = useMemo(() => {
    if (!item) return null;

    if (draftMode === 'equal') {
      const participants = allParticipants.filter((name) =>
        equalParticipants.has(name)
      );
      return {
        ...item,
        split_mode: 'equal',
        participants,
        allocations: undefined,
      } as SplitItem;
    }

    const allocations: Record<string, number> = {};
    for (const name of allParticipants) {
      allocations[name] =
        draftMode === 'unequal' && unequalAutoAmounts
          ? unequalAutoAmounts[name] ?? 0
          : parseValue(values[name]);
    }
    const participants = allParticipants.filter((name) => allocations[name] > 0);
    return {
      ...item,
      split_mode: draftMode,
      allocations,
      participants,
    } as SplitItem;
  }, [
    item,
    allParticipants,
    draftMode,
    equalParticipants,
    values,
    unequalAutoAmounts,
  ]);

  const summary = useMemo(
    () => (draftItem ? computeAllocationSummary(draftItem) : null),
    [draftItem]
  );

  const participantAvatar = (name: string) =>
    getParticipantAvatarUrl(name, group);

  const locked = item ? isItemLocked(item) : false;
  const wasParticipating = item?.participants.includes(myName) ?? false;
  const numericMyValue =
    draftMode === 'unequal'
      ? draftItem?.allocations?.[myName] ?? 0
      : parseValue(values[myName]);

  const equalParticipantsChanged = useMemo(() => {
    if (!item) return false;
    const before = new Set(item.participants);
    return (
      before.size !== equalParticipants.size ||
      [...before].some((name) => !equalParticipants.has(name))
    );
  }, [item, equalParticipants]);

  const canConfirm =
    !readOnly &&
    canMemberSaveAllocation(draftMode, {
      equalParticipating: equalParticipants.has(myName),
      myValue: numericMyValue,
      locked,
      wasParticipating,
      originalValue: item?.allocations?.[myName] ?? 0,
      totalIsValid: draftMode === 'unequal' ? summary?.isValid : undefined,
      participantsChanged: equalParticipantsChanged,
    });

  const handleModeChange = (mode: SplitItemMode) => {
    if (!item) return;
    setDraftMode(mode);
    setPinnedNames(new Set());
    if (mode === 'equal') {
      setEqualParticipants(new Set(item.participants));
      return;
    }
    const migrated = migrateItemToMode(item, mode, allParticipants);
    setValues(seedValues(migrated, allParticipants));
  };

  const handleConfirm = () => {
    if (!item || !draftItem || !canConfirm) return;
    onConfirm(draftItem);
    onClose();
  };

  const setParticipantValue = (name: string, raw: string) => {
    setValues((prev) => ({ ...prev, [name]: raw }));
  };

  const myShare = draftItem ? computeParticipantAmount(draftItem, myName) : 0;

  // ---- read-only view (replaces the standalone "who divides" sheet) ----
  if (item && readOnly) {
    const active = getActiveParticipants(item);
    const mode = getSplitItemMode(item);
    const myAmount = active.includes(myName)
      ? computeParticipantAmount(item, myName)
      : null;

    return (
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        title={item.name?.trim() || 'Item'}
        subtitle={formatCurrency(item.price)}
        size="medium"
        minimizedAboveBottomNav={false}
      >
        <div className="space-y-4 px-1 pb-2">
          {active.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">
              Ninguém marcou este item ainda.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    Tipo de divisão
                  </p>
                  <p className="text-sm font-bold text-primary-600 dark:text-primary-400">
                    {SPLIT_ITEM_MODE_LABELS[mode]}
                  </p>
                </div>
                {myAmount !== null && (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                      A tua parte
                    </p>
                    <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                      {formatCurrency(myAmount)}
                    </p>
                  </div>
                )}
              </div>

              <ul className="space-y-2">
                {allParticipants.map((name) => {
                  const isActive = active.includes(name);
                  const isMe = name === myName;
                  const amount = isActive
                    ? computeParticipantAmount(item, name)
                    : null;
                  return (
                    <li
                      key={name}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border',
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] opacity-50'
                      )}
                    >
                      <Avatar
                        name={name}
                        src={participantAvatar(name)}
                        size="sm"
                      />
                      <span className="flex-1 font-medium text-[var(--text-primary)] min-w-0 truncate">
                        {name}
                        {isMe && (
                          <span className="text-xs font-normal text-[var(--text-muted)] ml-1">
                            (tu)
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-semibold shrink-0',
                          isActive
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-[var(--text-muted)]'
                        )}
                      >
                        {amount !== null ? formatCurrency(amount) : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </Sheet>
    );
  }

  const renderValueRow = (
    name: string,
    variant: 'primary' | 'secondary' = 'secondary'
  ) => {
    const isMe = name === myName;
    const isPrimary = variant === 'primary';
    const isUnequal = draftMode === 'unequal';
    const suffix = isUnequal ? '€' : '';
    const amount = draftItem ? computeParticipantAmount(draftItem, name) : 0;
    const active = parseValue(values[name]) > 0;

    const isPinned = pinnedNames.has(name);
    const hasAnyPin = pinnedNames.size > 0;
    // Once someone is pinned, every other field auto-fills the remaining
    // amount and is no longer directly editable — unpin (or pin it too) to edit it.
    // An item locked in the DB (everyone already on it) is frozen entirely.
    const inputDisabled = isUnequal && (locked || (hasAnyPin && !isPinned));
    const displayValue = inputDisabled
      ? unequalAutoAmounts?.[name]
        ? unequalAutoAmounts[name].toFixed(2)
        : ''
      : values[name] ?? '';

    const maxAllowed = isUnequal && !inputDisabled ? maxAllowedForUnequal(name) : null;
    const overMax =
      focusedName === name &&
      maxAllowed !== null &&
      parseValue(values[name]) > maxAllowed + 0.005;

    return (
      <li
        key={name}
        className={cn(
          'rounded-xl border',
          isPrimary
            ? 'p-4 border-2 border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20'
            : 'p-3 border-[var(--border)] bg-[var(--bg-secondary)]',
          !active && !isPrimary && 'opacity-70'
        )}
      >
        <div className="flex items-center gap-3">
          <Avatar
            name={name}
            src={participantAvatar(name)}
            size={isPrimary ? 'md' : 'sm'}
          />
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                'font-medium text-[var(--text-primary)]',
                !isPrimary && 'truncate'
              )}
            >
              {name}
              {isMe && !isPrimary && (
                <span className="text-xs font-normal text-[var(--text-muted)] ml-1">
                  (tu)
                </span>
              )}
            </p>
            {(active || isPrimary) && (
              <p className="text-xs text-primary-600 dark:text-primary-400 font-semibold">
                {isPrimary ? `A tua parte: ${formatCurrency(amount)}` : formatCurrency(amount)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isUnequal && !locked && (
              <button
                type="button"
                onClick={() => togglePin(name)}
                aria-pressed={isPinned}
                aria-label={
                  isPinned
                    ? `Desbloquear valor de ${name}`
                    : `Bloquear valor de ${name}`
                }
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                  isPinned
                    ? 'bg-primary-600 text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                <Icon name={isPinned ? 'lock' : 'lock_open'} className="text-[16px]" />
              </button>
            )}
            {suffix && (
              <span className="text-sm text-[var(--text-muted)]">{suffix}</span>
            )}
            <input
              type="number"
              inputMode={draftMode === 'shares' ? 'numeric' : 'decimal'}
              min={0}
              step={draftMode === 'shares' ? 1 : 0.01}
              value={displayValue}
              disabled={inputDisabled}
              onChange={(e) => setParticipantValue(name, e.target.value)}
              onFocus={() => setFocusedName(name)}
              onBlur={(e) => {
                // Trap focus here until the value is fixed — an over-max
                // amount can't be left behind for someone else to inherit.
                if (isValueOverMax(name)) {
                  e.target.focus();
                  return;
                }
                setFocusedName((prev) => (prev === name ? null : prev));
              }}
              placeholder="0"
              className={cn(
                'text-right font-bold bg-transparent border-b-2 outline-none py-1',
                isPrimary
                  ? 'w-24 text-xl border-primary-400 focus:border-primary-600'
                  : 'w-20 text-base border-[var(--border)] focus:border-primary-500',
                inputDisabled && 'opacity-60 cursor-not-allowed'
              )}
            />
          </div>
        </div>
        {overMax && maxAllowed !== null && (
          <p className="mt-1.5 text-right text-xs text-red-600 dark:text-red-400">
            Insere um valor abaixo de {formatCurrency(maxAllowed)}.
          </p>
        )}
      </li>
    );
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={item?.name?.trim() || 'A tua parte'}
      subtitle={item ? formatCurrency(item.price) : undefined}
      size="medium"
      minimizedAboveBottomNav={false}
      footer={
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full py-4 text-lg font-semibold btn btn-primary disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <Icon name="check" className="text-[22px]" />
          Confirmar
        </button>
      }
    >
      {item && (
        <div className="space-y-4 px-1 pb-2">
          {!locked && (
            <p className="text-sm text-[var(--text-secondary)]">
              Indica como queres dividir este item. As alterações só são
              guardadas quando confirmares.
            </p>
          )}

          {locked ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary-600 dark:text-primary-400">
              <Icon name="lock" className="text-[16px]" />
              {SPLIT_ITEM_MODE_LABELS[draftMode]}
            </div>
          ) : (
            <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {MEMBER_ALLOCATION_MODES.filter(
                (tab) => allowedModes.includes(tab) || tab === draftMode
              ).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleModeChange(tab)}
                  className={cn(
                    'shrink-0 px-3 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                    draftMode === tab
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {SPLIT_ITEM_MODE_LABELS[tab]}
                </button>
              ))}
            </div>
          )}

          {draftMode === 'equal' ? (
            <>
              <div className="rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20 p-4 flex items-center gap-3">
                <Avatar name={myName} src={participantAvatar(myName)} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--text-primary)]">
                    {myName}
                  </p>
                  {equalParticipants.has(myName) && (
                    <p className="text-xs text-primary-600 dark:text-primary-400 font-semibold">
                      A tua parte: {formatCurrency(myShare)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => toggleEqualParticipant(myName)}
                  className={cn(
                    'w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-colors shrink-0',
                    equalParticipants.has(myName)
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'border-[var(--border)] bg-[var(--bg-primary)]',
                    locked && 'opacity-60 cursor-not-allowed'
                  )}
                  aria-pressed={equalParticipants.has(myName)}
                >
                  {equalParticipants.has(myName) && (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {locked && (
                <p className="text-xs text-[var(--text-muted)]">
                  Este item já está bloqueado — os participantes não podem ser
                  alterados.
                </p>
              )}

              {(() => {
                const others = allParticipants.filter((name) => name !== myName);
                if (others.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      Outros participantes
                    </p>
                    <ul className="space-y-2">
                      {others.map((name) => {
                        const checked = equalParticipants.has(name);
                        return (
                          <li
                            key={name}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]',
                              !checked && 'opacity-70'
                            )}
                          >
                            <Avatar
                              name={name}
                              src={participantAvatar(name)}
                              size="sm"
                            />
                            <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                              {name}
                            </span>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => toggleEqualParticipant(name)}
                              className={cn(
                                'w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors shrink-0',
                                checked
                                  ? 'bg-primary-600 border-primary-600 text-white'
                                  : 'border-[var(--border)] bg-[var(--bg-primary)]',
                                locked && 'opacity-60 cursor-not-allowed'
                              )}
                              aria-pressed={checked}
                            >
                              {checked && (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </>
          ) : draftMode === 'unequal' ? (
            // Exact amounts: every participant is editable so the total can be
            // reconciled to the item price. Locking (🔒) a value fixes it and
            // auto-splits the remainder evenly across the unlocked ones.
            <>
              <ul>{renderValueRow(myName, 'primary')}</ul>
              {locked && (
                <p className="text-xs text-[var(--text-muted)]">
                  Este item já está bloqueado — os valores não podem ser alterados.
                </p>
              )}

              {(() => {
                const others = allParticipants.filter((name) => name !== myName);
                if (others.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      Outros participantes
                    </p>
                    <ul className="space-y-2">
                      {others.map((name) => renderValueRow(name, 'secondary'))}
                    </ul>
                  </div>
                );
              })()}
            </>
          ) : (
            // Shares: each person sets their own count.
            <>
              <div className="rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/20 p-4 flex items-center gap-3">
                <Avatar name={myName} src={participantAvatar(myName)} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--text-primary)]">
                    {myName}
                  </p>
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-semibold">
                    A tua parte: {formatCurrency(myShare)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={values[myName] ?? ''}
                    disabled={locked && wasParticipating}
                    onChange={(e) => setParticipantValue(myName, e.target.value)}
                    placeholder="0"
                    autoFocus
                    className={cn(
                      'w-24 text-right text-xl font-bold bg-transparent border-b-2 border-primary-400 focus:border-primary-600 outline-none py-1',
                      locked && wasParticipating && 'opacity-60 cursor-not-allowed'
                    )}
                  />
                </div>
              </div>
              {locked && wasParticipating && (
                <p className="text-xs text-[var(--text-muted)]">
                  Este item já está bloqueado — a tua parte não pode ser alterada.
                </p>
              )}

              {(() => {
                const others = allParticipants.filter((name) => name !== myName);
                if (others.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      Outros participantes
                    </p>
                    <ul className="space-y-2">
                      {others.map((name) => {
                        const isActive = parseValue(values[name]) > 0;
                        return (
                          <li
                            key={name}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]',
                              !isActive && 'opacity-70'
                            )}
                          >
                            <Avatar
                              name={name}
                              src={participantAvatar(name)}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--text-primary)] truncate">
                                {name}
                              </p>
                              {isActive && (
                                <p className="text-xs text-[var(--text-muted)]">
                                  {formatCurrency(
                                    draftItem
                                      ? computeParticipantAmount(draftItem, name)
                                      : 0
                                  )}
                                </p>
                              )}
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={values[name] ?? ''}
                              disabled={locked}
                              onChange={(e) => setParticipantValue(name, e.target.value)}
                              placeholder="0"
                              className={cn(
                                'w-16 text-right font-semibold bg-transparent border-b-2 border-[var(--border)] focus:border-primary-500 outline-none py-1',
                                locked && 'opacity-60 cursor-not-allowed'
                              )}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </>
          )}

          <div className="rounded-xl bg-[var(--bg-tertiary)] px-4 py-3 text-sm">
            {draftMode === 'equal' &&
              equalParticipants.has(myName) &&
              item.price > 0 && (
              <p className="text-[var(--text-secondary)]">
                Divides igualmente com quem mais marcar este item.
              </p>
            )}
            {draftMode === 'shares' && (
              <p className="text-[var(--text-secondary)]">
                {summary && summary.assigned > 0
                  ? `${summary.assigned} parte${summary.assigned === 1 ? '' : 's'} no total — o valor é proporcional.`
                  : 'Indica quantas unidades consumiste (ex.: 2 cervejas).'}
              </p>
            )}
            {draftMode === 'unequal' && summary && (
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  {formatCurrency(summary.assigned)} de{' '}
                  {formatCurrency(summary.total)} atribuídos
                </p>
                <p
                  className={cn(
                    'mt-0.5',
                    summary.isValid
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  )}
                >
                  {summary.isValid
                    ? 'Total certo.'
                    : `${formatCurrency(Math.abs(summary.remaining))} ${
                        summary.remaining > 0 ? 'em falta' : 'a mais'
                      }.`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
