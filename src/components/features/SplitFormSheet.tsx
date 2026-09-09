'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Sheet, SheetSize } from '@/components/ui/Sheet';
import { AnimatedStep } from '@/components/ui/AnimatedStep';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { OrderParticipantsPicker } from '@/components/features/OrderParticipantsPicker';
import { SplitAllowedModesToggleList } from '@/components/features/SplitAllowedModesSheet';
import { splitsApi } from '@/lib/pocketbase';
import { assertOnline, mutationErrorMessage } from '@/lib/db/mutations';
import { participantDisplayName } from '@/lib/splitShare';
import { MEMBER_ALLOCATION_MODES } from '@/lib/splitItemAllocation';
import type { Split, SplitItemMode, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';
import { useToast } from '@/context/ToastContext';

type SplitFormStep = 'details' | 'audience' | 'participants';
type SplitAudienceType = 'me' | 'several' | 'all';

const STEP_ORDER: Record<SplitFormStep, number> = {
  details: 0,
  audience: 1,
  participants: 2,
};

interface SplitFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (split: Split) => void;
  groupId: string;
  groupMembers: User[];
  currentUserId: string;
  currentUserName: string;
}

export function SplitFormSheet({
  isOpen,
  onClose,
  onCreated,
  groupId,
  groupMembers,
  currentUserId,
  currentUserName,
}: SplitFormSheetProps) {
  const { trigger } = useWebHaptics();
  const { showToast } = useToast();

  const [step, setStep] = useState<SplitFormStep>('details');
  const [stepDirection, setStepDirection] = useState(1);
  const navigateToStep = useCallback((next: SplitFormStep) => {
    setStepDirection(STEP_ORDER[next] >= STEP_ORDER[step] ? 1 : -1);
    setStep(next);
  }, [step]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowedModes, setAllowedModes] = useState<Set<SplitItemMode>>(
    new Set(MEMBER_ALLOCATION_MODES)
  );

  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setStepDirection(1);
    setStep('details');
    setName('');
    setDescription('');
    setShowAdvanced(false);
    setAllowedModes(new Set(MEMBER_ALLOCATION_MODES));
    setSelectedParticipantIds(currentUserId ? [currentUserId] : []);
  }, [isOpen, currentUserId]);

  const toggleAllowedMode = (mode: SplitItemMode) => {
    setAllowedModes((prev) => {
      if (prev.has(mode) && prev.size <= 1) {
        showToast('Tem de ficar pelo menos um modo permitido', 'error');
        return prev;
      }
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  };

  const handleSubmit = async (participantIdsOverride?: string[]) => {
    if (!name.trim() || !currentUserId || submitting) return;
    trigger('success');
    setSubmitting(true);
    try {
      assertOnline();
      const idsToUse = participantIdsOverride ?? selectedParticipantIds;
      const namesFromIds = idsToUse
        .map((id) => groupMembers.find((m) => m.id === id))
        .filter((m): m is User => Boolean(m))
        .map(participantDisplayName)
        .filter(Boolean);

      let participants = Array.from(new Set(namesFromIds));
      if (!participants.some((p) => p.toLowerCase() === currentUserName.toLowerCase())) {
        participants = [currentUserName, ...participants];
      }
      if (participants.length === 0) {
        participants = [currentUserName];
      }

      const created = await splitsApi.create({
        name: name.trim(),
        description: description.trim(),
        group_id: groupId,
        created_by: currentUserId,
        participants,
        allowed_modes: Array.from(allowedModes),
      });

      showToast('Divisão criada!', 'success');
      onCreated(created);
    } catch (error) {
      console.error('Error creating split:', error);
      showToast(mutationErrorMessage(error, 'Erro ao criar divisão'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectAudience = (type: SplitAudienceType) => {
    trigger();
    if (type === 'me') {
      const ids = currentUserId ? [currentUserId] : [];
      setSelectedParticipantIds(ids);
      void handleSubmit(ids);
    } else if (type === 'all') {
      const ids = groupMembers.map((m) => m.id);
      setSelectedParticipantIds(ids);
      void handleSubmit(ids);
    } else {
      setSelectedParticipantIds(currentUserId ? [currentUserId] : []);
      navigateToStep('participants');
    }
  };

  const handleBack = () => {
    if (step === 'participants') {
      navigateToStep('audience');
    } else if (step === 'audience') {
      navigateToStep('details');
    }
  };

  const showBackButton = step !== 'details';

  const handleDetailsNext = () => {
    if (!name.trim()) return;
    trigger();
    navigateToStep('audience');
  };

  const sheetTitle = step === 'details' ? 'Nova Divisão' : 'Quem participa?';

  const sheetSize: SheetSize = step === 'participants' ? 'large' : 'medium';

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={sheetTitle}
      size={sheetSize}
      onBack={showBackButton ? handleBack : undefined}
      footerKey={step}
      footer={
        step === 'details' ? (
          <button
            type="button"
            disabled={!name.trim()}
            onClick={handleDetailsNext}
            className="btn btn-primary w-full py-4 text-lg font-semibold shadow-lg shadow-violet-200/50 disabled:opacity-50"
          >
            Continuar
          </button>
        ) : step === 'audience' ? undefined : (
          <button
            type="button"
            disabled={selectedParticipantIds.length === 0 || submitting}
            onClick={() => handleSubmit()}
            className="btn btn-primary w-full py-4 text-lg font-semibold shadow-lg shadow-violet-200/50 disabled:opacity-50"
          >
            {submitting ? 'A criar...' : 'Criar Divisão'}
          </button>
        )
      }
    >
      <AnimatedStep
        stepKey={step}
        direction={stepDirection}
        variant={step === 'details' || step === 'audience' ? 'fade' : 'slide'}
        className="flex flex-col gap-6 pb-2 flex-1 min-h-0 overflow-visible"
      >
        {step === 'details' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                Nome da Divisão
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Jantar de Grupo"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-lg dark:text-white"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                Descrição (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adiciona detalhes sobre o que está a ser dividido..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 resize-none dark:text-white"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center justify-between w-full text-left py-1"
              >
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Definições avançadas
                </span>
                <span
                  className={cn(
                    'material-icons text-gray-400 transition-transform',
                    showAdvanced && 'rotate-180'
                  )}
                >
                  expand_more
                </span>
              </button>
              {showAdvanced && (
                <div className="mt-3">
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Escolhe que modos de divisão os participantes podem usar
                  </p>
                  <SplitAllowedModesToggleList
                    enabledModes={allowedModes}
                    onToggle={toggleAllowedMode}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'audience' && (
          <div className="relative">
            <div
              className={cn(
                'grid grid-cols-2 gap-3',
                submitting && 'opacity-40 pointer-events-none'
              )}
            >
              <AudienceCard icon="person" label="Só eu" onClick={() => selectAudience('me')} />
              <AudienceCard icon="group" label="Vários" onClick={() => selectAudience('several')} />
              <AudienceCard
                icon="groups"
                label="Todos"
                onClick={() => selectAudience('all')}
                className="col-span-2"
              />
            </div>
            {submitting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner size="md" />
              </div>
            )}
          </div>
        )}

        {step === 'participants' && (
          <OrderParticipantsPicker
            groupMembers={groupMembers}
            selectedParticipantIds={selectedParticipantIds}
            onSelectedChange={setSelectedParticipantIds}
          />
        )}
      </AnimatedStep>
    </Sheet>
  );
}

function AudienceCard({
  icon,
  label,
  onClick,
  className,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-100 dark:border-slate-700',
        'bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 dark:hover:border-primary-600',
        'hover:bg-primary-50/50 dark:hover:bg-primary-900/20',
        'active:scale-[0.98] transition-[transform,background-color,border-color]',
        className
      )}
    >
      <span className="material-icons text-4xl text-primary-600 dark:text-primary-400">{icon}</span>
      <span className="font-bold text-gray-900 dark:text-gray-100">{label}</span>
    </button>
  );
}
