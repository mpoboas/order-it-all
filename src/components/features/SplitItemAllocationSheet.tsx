'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import {
  computeAllocationSummary,
  computeParticipantAmount,
  getSplitItemMode,
  migrateItemToMode,
  normalizeSplitItem,
  SPLIT_ITEM_MODE_LABELS,
} from '@/lib/splitItemAllocation';
import type { Group, SplitItem, SplitItemMode } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import { getParticipantAvatarUrl } from '@/lib/splitShare';

const MODES: SplitItemMode[] = ['equal', 'unequal', 'percentage', 'shares'];

interface SplitItemAllocationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  itemIndex: number | null;
  item: SplitItem | null;
  allParticipants: string[];
  group: Pick<Group, 'expand'> | null | undefined;
  onSave: (item: SplitItem) => void;
}

export function SplitItemAllocationSheet({
  isOpen,
  onClose,
  itemIndex,
  item,
  allParticipants,
  group,
  onSave,
}: SplitItemAllocationSheetProps) {
  const [draft, setDraft] = useState<SplitItem | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      return;
    }
    if (itemIndex === null || !item) return;
    setDraft(normalizeSplitItem(item, allParticipants));
  }, [isOpen, itemIndex]);

  const mode = draft ? getSplitItemMode(draft) : 'equal';
  const summary = useMemo(
    () => (draft ? computeAllocationSummary(draft) : null),
    [draft]
  );

  const participantAvatar = (name: string) =>
    getParticipantAvatarUrl(name, group);

  const setMode = (nextMode: SplitItemMode) => {
    if (!draft) return;
    setDraft(migrateItemToMode(draft, nextMode, allParticipants));
  };

  const toggleEqualParticipant = (name: string) => {
    if (!draft) return;
    const selected = new Set(draft.participants);
    if (selected.has(name)) {
      selected.delete(name);
    } else {
      selected.add(name);
    }
    setDraft({
      ...draft,
      split_mode: 'equal',
      participants: Array.from(selected),
      allocations: undefined,
    });
  };

  const setAllocationValue = (name: string, raw: string) => {
    if (!draft) return;
    const parsed = raw === '' ? 0 : Number.parseFloat(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    const allocations = { ...(draft.allocations ?? {}), [name]: value };
    const participants = allParticipants.filter(
      (participant) => (allocations[participant] ?? 0) > 0
    );

    setDraft({
      ...draft,
      allocations,
      participants,
    });
  };

  const handleSave = () => {
    if (!draft) return;
    const normalized = normalizeSplitItem(draft, allParticipants);
    const result = computeAllocationSummary(normalized);
    if (!result.isValid) return;
    onSave(normalized);
    onClose();
  };

  const renderEqualRow = (name: string) => {
    const checked = draft?.participants.includes(name) ?? false;
    return (
      <li
        key={name}
        className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-0"
      >
        <Avatar name={name} src={participantAvatar(name)} size="sm" />
        <span className="flex-1 font-medium text-[var(--text-primary)] truncate">
          {name}
        </span>
        <button
          type="button"
          onClick={() => toggleEqualParticipant(name)}
          className={cn(
            'w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-colors',
            checked
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'border-[var(--border)] bg-[var(--bg-primary)]'
          )}
          aria-pressed={checked}
        >
          {checked && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      </li>
    );
  };

  const renderValueRow = (
    name: string,
    suffix: string,
    inputMode: 'decimal' | 'numeric'
  ) => {
    const value = draft?.allocations?.[name] ?? 0;
    const amount = draft ? computeParticipantAmount(draft, name) : 0;
    const active = value > 0;

    return (
      <li
        key={name}
        className={cn(
          'flex items-center gap-3 py-3 border-b border-[var(--border)] last:border-0',
          !active && 'opacity-60'
        )}
      >
        <Avatar name={name} src={participantAvatar(name)} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--text-primary)] truncate">{name}</p>
          {active && mode !== 'unequal' && (
            <p className="text-xs text-primary-600 dark:text-primary-400">
              {formatCurrency(amount)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {suffix && (
            <span className="text-sm text-[var(--text-muted)]">{suffix}</span>
          )}
          <input
            type="number"
            inputMode={inputMode}
            min={0}
            step={mode === 'percentage' ? 1 : mode === 'shares' ? 1 : 0.01}
            value={value === 0 ? '' : value}
            onChange={(e) => setAllocationValue(name, e.target.value)}
            placeholder="0"
            className="w-20 text-right text-base font-semibold bg-transparent border-b-2 border-[var(--border)] focus:border-primary-500 outline-none py-1"
          />
        </div>
      </li>
    );
  };

  const footerSummary = () => {
    if (!summary || !draft) return null;

    if (summary.mode === 'equal') {
      const count = draft.participants.length;
      if (count === 0) {
        return (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Seleciona pelo menos um participante.
          </p>
        );
      }
      return (
        <p className="text-sm text-[var(--text-secondary)]">
          {formatCurrency(draft.price)} dividido por {count} pessoa
          {count === 1 ? '' : 's'} ({formatCurrency(draft.price / count)} cada)
        </p>
      );
    }

    if (summary.mode === 'unequal') {
      return (
        <div className="text-sm">
          <p className="font-semibold text-[var(--text-primary)]">
            {formatCurrency(summary.assigned)} de {formatCurrency(summary.total)}
          </p>
          <p
            className={cn(
              summary.isValid
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            )}
          >
            {summary.isValid
              ? 'Total atribuído'
              : `${formatCurrency(Math.abs(summary.remaining))} em falta`}
          </p>
        </div>
      );
    }

    if (summary.mode === 'percentage') {
      return (
        <div className="text-sm">
          <p className="font-semibold text-[var(--text-primary)]">
            {summary.assigned.toFixed(0)}% de 100%
          </p>
          <p
            className={cn(
              summary.isValid
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            )}
          >
            {summary.isValid
              ? 'Total atribuído'
              : `${Math.abs(summary.remaining).toFixed(0)}% em falta`}
          </p>
        </div>
      );
    }

    return (
      <p className="text-sm text-[var(--text-secondary)]">
        {summary.assigned > 0
          ? `${summary.assigned} parte${summary.assigned === 1 ? '' : 's'} no total`
          : 'Define pelo menos uma quantidade.'}
      </p>
    );
  };

  const canSave = summary?.isValid ?? false;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={draft?.name?.trim() || 'Ajustar divisão'}
      subtitle={draft ? formatCurrency(draft.price) : undefined}
      size="large"
      minimizedAboveBottomNav={false}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-4 text-lg font-semibold btn btn-primary disabled:opacity-50"
        >
          Guardar
        </button>
      }
    >
      {draft && (
        <div className="space-y-4 px-1 pb-2">
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {MODES.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMode(tab)}
                className={cn(
                  'shrink-0 px-3 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                  mode === tab
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                )}
              >
                {SPLIT_ITEM_MODE_LABELS[tab]}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-[var(--border)]">
            {mode === 'equal'
              ? allParticipants.map(renderEqualRow)
              : mode === 'unequal'
                ? allParticipants.map((name) => renderValueRow(name, '€', 'decimal'))
                : mode === 'percentage'
                  ? allParticipants.map((name) => renderValueRow(name, '%', 'decimal'))
                  : allParticipants.map((name) => renderValueRow(name, '', 'numeric'))}
          </ul>

          <div className="rounded-xl bg-[var(--bg-tertiary)] px-4 py-3">
            {footerSummary()}
          </div>
        </div>
      )}
    </Sheet>
  );
}
