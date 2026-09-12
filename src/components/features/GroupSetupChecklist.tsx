'use client';

import { useEffect, useState } from 'react';
import { pb } from '@/lib/pocketbase';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

interface ChecklistStep {
  label: string;
  done: boolean;
  onClick?: () => void;
}

interface GroupSetupChecklistProps {
  memberCount: number;
  tripCount: number;
  onInvite: () => void;
  onCreateTrip: () => void;
}

/** Por utilizador, não por grupo — "uma vez na vida", não "uma vez por grupo". */
function storageKey(): string | null {
  const userId = pb.authStore.model?.id;
  return userId ? `group-setup-checklist-seen:${userId}` : null;
}

/**
 * Checklist de arranque (Fase 2 do plano de onboarding — padrão Notion/Slack:
 * passos concretos com progresso visível, "aprender fazendo" em vez de tour).
 * Só para quem criou o grupo de raiz — é o caminho onde ninguém ainda explicou
 * nada.
 *
 * Aparece **uma única vez na vida do utilizador**, em qualquer grupo — não
 * uma vez por grupo. Completar os passos OU dispensar marca para sempre: se
 * depois apagares a viagem que a completou, ou criares outro grupo mais
 * tarde, não volta a aparecer.
 */
export function GroupSetupChecklist({
  memberCount,
  tripCount,
  onInvite,
  onCreateTrip,
}: GroupSetupChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // true até ler o localStorage — evita flash

  useEffect(() => {
    const key = storageKey();
    try {
      setDismissed(!!key && localStorage.getItem(key) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const invited = memberCount > 1;
  const hasTrip = tripCount > 0;
  const allDone = invited && hasTrip;

  // Assim que fica completa uma vez, grava já — apagar a viagem ou remover o
  // convidado depois não deve trazer isto de volta.
  useEffect(() => {
    if (!allDone) return;
    const key = storageKey();
    if (key) {
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    }
  }, [allDone]);

  if (allDone || dismissed) return null;

  const dismiss = () => {
    const key = storageKey();
    if (key) {
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    }
    setDismissed(true);
  };

  const steps: ChecklistStep[] = [
    { label: 'Criar o grupo', done: true },
    { label: 'Convidar alguém', done: invited, onClick: onInvite },
    { label: 'Criar a primeira viagem', done: hasTrip, onClick: onCreateTrip },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="card relative p-4 mb-6 bg-surface border border-hairline animate-fade-in-up">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar"
        className="absolute top-3 right-3 p-1.5 text-ink-faint hover:text-ink hover:bg-surface-sunken rounded-full transition-colors"
      >
        <Icon name="close" className="text-lg" />
      </button>

      <div className="flex items-center justify-between mb-3 pr-8">
        <h3 className="font-semibold text-ink">A dar os primeiros passos</h3>
        <span className="text-xs font-bold text-ink-faint tabular-nums">
          {doneCount}/{steps.length}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mb-4">
        <div
          className="h-full bg-primary-600 rounded-full transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.label}>
            <button
              type="button"
              disabled={step.done || !step.onClick}
              onClick={step.onClick}
              className={cn(
                'w-full flex items-center gap-3 text-left px-3 py-2 rounded-xl transition-colors',
                !step.done && step.onClick && 'hover:bg-surface-sunken cursor-pointer',
                (step.done || !step.onClick) && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors',
                  step.done ? 'bg-status-bought border-status-bought text-white' : 'border-hairline-strong',
                )}
              >
                {step.done && <Icon name="check" className="text-xs" strokeWidth={3} />}
              </span>
              <span className={cn('text-sm font-medium', step.done ? 'text-ink-faint line-through' : 'text-ink')}>
                {step.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
