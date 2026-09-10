'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { splitsApi } from '@/lib/pocketbase';
import {
  MEMBER_ALLOCATION_MODES,
  SPLIT_ITEM_MODE_LABELS,
  getAllowedMemberModes,
} from '@/lib/splitItemAllocation';
import type { Split, SplitItemMode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';

interface SplitAllowedModesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  split: Split;
  onSplitUpdate: (split: Split) => void;
}

const MODE_DESCRIPTIONS: Record<SplitItemMode, string> = {
  equal: 'Divide o preço em partes iguais entre quem participa.',
  shares: 'Cada pessoa indica quantas unidades consumiu (ex.: 2 cervejas).',
  unequal: 'Cada pessoa recebe um valor exato em euros.',
  percentage: '',
};

interface SplitAllowedModesToggleListProps {
  enabledModes: Set<SplitItemMode>;
  onToggle: (mode: SplitItemMode) => void;
  disabled?: boolean;
}

/** Presentational toggle-switch list shared by the settings sheet and the create wizard. */
export function SplitAllowedModesToggleList({
  enabledModes,
  onToggle,
  disabled = false,
}: SplitAllowedModesToggleListProps) {
  return (
    <div className="space-y-3 px-1">
      {MEMBER_ALLOCATION_MODES.map((mode) => {
        const isEnabled = enabledModes.has(mode);
        return (
          <div
            key={mode}
            className="flex items-center justify-between gap-3 rounded-xl border border-hairline px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {SPLIT_ITEM_MODE_LABELS[mode]}
              </p>
              <p className="text-xs text-ink-faint mt-0.5">
                {MODE_DESCRIPTIONS[mode]}
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(mode)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
                isEnabled ? "bg-primary-600" : "bg-hairline-strong"
              )}
              aria-pressed={isEnabled}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ml-1',
                  isEnabled && 'translate-x-5'
                )}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function SplitAllowedModesSheet({
  isOpen,
  onClose,
  split,
  onSplitUpdate,
}: SplitAllowedModesSheetProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Set<SplitItemMode>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setEnabled(new Set(getAllowedMemberModes(split)));
  }, [isOpen, split]);

  const toggleMode = async (mode: SplitItemMode) => {
    const isEnabled = enabled.has(mode);
    if (isEnabled && enabled.size <= 1) {
      showToast('Tem de ficar pelo menos um modo permitido', 'error');
      return;
    }

    const next = new Set(enabled);
    if (isEnabled) {
      next.delete(mode);
    } else {
      next.add(mode);
    }

    const nextModes = MEMBER_ALLOCATION_MODES.filter((m) => next.has(m));
    setEnabled(next);
    setSaving(true);
    try {
      const updated = await splitsApi.update(split.id, {
        allowed_modes: nextModes,
      });
      onSplitUpdate(updated);
    } catch {
      setEnabled(enabled);
      showToast('Erro ao guardar definição', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Definições da divisão"
      subtitle="Escolhe que modos de divisão os participantes podem usar"
      size="medium"
    >
      <SplitAllowedModesToggleList
        enabledModes={enabled}
        onToggle={(mode) => void toggleMode(mode)}
        disabled={saving}
      />
    </Sheet>
  );
}
