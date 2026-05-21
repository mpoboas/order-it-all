'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { AnimatedStep } from '@/components/ui/AnimatedStep';
import { OrderParticipantsPicker } from '@/components/features/OrderParticipantsPicker';
import { OrderParticipantsRow } from '@/components/features/OrderParticipantsRow';
import { ordersApi, itemsApi } from '@/lib/pocketbase';
import type { Item, User } from '@/lib/types';
import {
  deriveOrderUserName,
  inferAudienceType,
  type OrderAudienceType,
} from '@/lib/orderParticipants';
import { cn } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { useWebHaptics } from 'web-haptics/react';

export interface MoveItemOrderOption {
  orderId: string;
  label: string;
  participantIds: string[];
  itemCount: number;
  creatorUserId: string;
}

type MoveStep = 'choose' | 'existing' | 'new-audience' | 'new-participants';

const STEP_ORDER: Record<MoveStep, number> = {
  choose: 0,
  existing: 1,
  'new-audience': 1,
  'new-participants': 2,
};

interface MoveItemSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item | null;
  sourceOrderId: string;
  tripId: string;
  groupMembers: User[];
  currentUserId: string;
  orderOptions: MoveItemOrderOption[];
  onMoved: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
  onDiscard?: () => void;
  minimizedAboveBottomNav?: boolean;
}

export function MoveItemSheet({
  isOpen,
  onClose,
  item,
  sourceOrderId,
  tripId,
  groupMembers,
  currentUserId,
  orderOptions,
  onMoved,
  minimized = false,
  onMinimize,
  onExpand,
  onDiscard,
  minimizedAboveBottomNav = true,
}: MoveItemSheetProps) {
  const { trigger } = useWebHaptics();
  const { showToast } = useToast();
  const [step, setStep] = useState<MoveStep>('choose');
  const [stepDirection, setStepDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [audienceType, setAudienceType] = useState<OrderAudienceType | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const navigateToStep = useCallback((next: MoveStep) => {
    setStepDirection(STEP_ORDER[next] >= STEP_ORDER[step] ? 1 : -1);
    setStep(next);
  }, [step]);

  const isSingleMemberPick = audienceType === 'me';

  const otherOrders = useMemo(
    () => orderOptions.filter(o => o.orderId !== sourceOrderId),
    [orderOptions, sourceOrderId]
  );

  const reset = () => {
    setStepDirection(1);
    setStep('choose');
    setTargetOrderId(null);
    setAudienceType(null);
    setSelectedParticipantIds([]);
    setSubmitting(false);
  };

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    reset();
  }, [isOpen, item?.id]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDiscard = () => {
    reset();
    onDiscard?.();
  };

  const handleBack = () => {
    if (step === 'new-participants') {
      navigateToStep('new-audience');
      setAudienceType(null);
    } else if (step === 'existing' || step === 'new-audience') {
      navigateToStep('choose');
      setTargetOrderId(null);
      setAudienceType(null);
      setSelectedParticipantIds([]);
    }
  };

  const selectAudience = (type: OrderAudienceType) => {
    trigger();
    setAudienceType(type);
    if (type === 'me') {
      setSelectedParticipantIds([]);
      navigateToStep('new-participants');
    } else if (type === 'all') {
      setSelectedParticipantIds(groupMembers.map(m => m.id));
      navigateToStep('new-participants');
    } else {
      setSelectedParticipantIds(currentUserId ? [currentUserId] : []);
      navigateToStep('new-participants');
    }
  };

  const cleanupEmptySourceOrder = async () => {
    const source = orderOptions.find(o => o.orderId === sourceOrderId);
    if (source && source.itemCount <= 1) {
      try {
        await ordersApi.delete(sourceOrderId);
      } catch {
        /* ignore — order may still have items if race */
      }
    }
  };

  const moveToOrder = async (orderId: string) => {
    if (!item) return;
    setSubmitting(true);
    try {
      await itemsApi.update(item.id, { order_id: orderId });
      await cleanupEmptySourceOrder();
      trigger('success');
      onMoved();
      handleClose();
    } catch {
      trigger('error');
      showToast('Falha ao mover produto', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmExisting = () => {
    if (!targetOrderId) return;
    moveToOrder(targetOrderId);
  };

  const handleConfirmNew = async () => {
    if (!item || selectedParticipantIds.length === 0) return;
    const audience = audienceType ?? inferAudienceType(selectedParticipantIds, groupMembers, selectedParticipantIds[0]);
    setSubmitting(true);
    try {
      const order = await ordersApi.create({
        trip_id: tripId,
        user_name: deriveOrderUserName(selectedParticipantIds, groupMembers, audience),
        participantIds: selectedParticipantIds,
        user_id: audience === 'all' ? null : (selectedParticipantIds[0] ?? null),
      });
      await itemsApi.update(item.id, { order_id: order.id });
      await cleanupEmptySourceOrder();
      trigger('success');
      onMoved();
      handleClose();
    } catch {
      trigger('error');
      showToast('Falha ao criar pedido', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sheetTitle =
    step === 'choose' ? 'Mover produto' :
      step === 'existing' ? 'Escolher pedido' :
        step === 'new-audience' ? 'Novo pedido para…' :
          isSingleMemberPick ? 'Qual membro?' : 'Quem participa?';

  const showBack = step !== 'choose';

  const minimizedSummary = useMemo(() => {
    if (!item) return null;
    const stepLabels: Record<MoveStep, string> = {
      choose: 'A escolher destino',
      existing: 'Pedido existente',
      'new-audience': 'Novo pedido',
      'new-participants': isSingleMemberPick ? 'A escolher membro' : 'Participantes',
    };
    return `${stepLabels[step]}`;
  }, [item, step, isSingleMemberPick]);

  const footer =
    step === 'existing' ? (
      <button
        type="button"
        disabled={!targetOrderId || submitting}
        onClick={handleConfirmExisting}
        className="btn btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50"
      >
        {submitting ? 'A mover…' : 'Mover para este pedido'}
      </button>
    ) : step === 'new-participants' && audienceType === 'all' ? (
      <button
        type="button"
        disabled={submitting}
        onClick={handleConfirmNew}
        className="btn btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50"
      >
        {submitting ? 'A criar…' : 'Criar pedido e mover'}
      </button>
    ) : step === 'new-participants' ? (
      <button
        type="button"
        disabled={selectedParticipantIds.length === 0 || submitting}
        onClick={handleConfirmNew}
        className="btn btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50"
      >
        {submitting ? 'A criar…' : isSingleMemberPick ? 'Confirmar' : 'Criar pedido e mover'}
      </button>
    ) : undefined;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleClose}
      title={sheetTitle}
      subtitle={item ? item.name : undefined}
      size={step === 'new-participants' || step === 'existing' ? 'large' : 'medium'}
      footerKey={step}
      onBack={showBack ? handleBack : undefined}
      minimizable
      minimized={minimized}
      onMinimize={onMinimize}
      onExpand={onExpand}
      onDiscard={handleDiscard}
      minimizedSummary={minimizedSummary}
      discardConfirmMessage="Descartar mover produto? Perdes o progresso."
      minimizedAboveBottomNav={minimizedAboveBottomNav}
      footer={footer}
    >
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-visible">
        <AnimatedStep stepKey={step} direction={stepDirection} className="flex flex-col gap-4 overflow-visible">
          {step === 'choose' && item && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Este produto passa para outro pedido. Os participantes do pedido de destino definem para quem é a compra.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => { trigger(); navigateToStep('existing'); }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 hover:bg-primary-50/40 text-left transition-colors"
                >
                  <span className="material-icons text-3xl text-primary-600">swap_horiz</span>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100">Pedido existente</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {otherOrders.length > 0
                        ? `${otherOrders.length} pedido${otherOrders.length === 1 ? '' : 's'} nesta viagem`
                        : 'Nenhum outro pedido — cria um novo'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { trigger(); navigateToStep('new-audience'); }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 hover:bg-primary-50/40 text-left transition-colors"
                >
                  <span className="material-icons text-3xl text-primary-600">add_circle</span>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100">Novo pedido</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Escolhe quem participa e move o produto
                    </p>
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'existing' && (
            <>
              {otherOrders.length === 0 ? (
                <p className="text-sm text-center text-gray-500 py-8">
                  Não há outros pedidos. Usa &quot;Novo pedido&quot; para criar um.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {otherOrders.map(order => {
                    const selected = targetOrderId === order.orderId;
                    return (
                      <li key={order.orderId}>
                        <button
                          type="button"
                          onClick={() => { trigger(); setTargetOrderId(order.orderId); }}
                          className={cn(
                            'w-full text-left p-4 rounded-2xl border-2 transition-all',
                            selected
                              ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-950/30'
                              : 'border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-primary-200'
                          )}
                        >
                          <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">{order.label}</p>
                          <OrderParticipantsRow
                            participantIds={order.participantIds}
                            members={groupMembers}
                            perspectiveUserId={order.creatorUserId || order.participantIds[0] || ''}
                            currentUserId={currentUserId}
                            namedPerspective
                            className="mt-0 pointer-events-none"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {step === 'new-audience' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectAudience('me')}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 hover:bg-primary-50/50"
              >
                <span className="material-icons text-4xl text-primary-600">person</span>
                <span className="font-bold">Um membro</span>
              </button>
              <button
                type="button"
                onClick={() => selectAudience('several')}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 hover:bg-primary-50/50"
              >
                <span className="material-icons text-4xl text-primary-600">group</span>
                <span className="font-bold">Vários</span>
              </button>
              <button
                type="button"
                onClick={() => selectAudience('all')}
                className="col-span-2 flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/50 hover:border-primary-300 hover:bg-primary-50/50"
              >
                <span className="material-icons text-4xl text-primary-600">groups</span>
                <span className="font-bold">Todos</span>
              </button>
            </div>
          )}

          {step === 'new-participants' && audienceType === 'all' && (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-4">
              O produto vai para um pedido para <strong>todo o grupo</strong>.
            </p>
          )}

          {step === 'new-participants' && audienceType !== 'all' && (
            <OrderParticipantsPicker
              groupMembers={groupMembers}
              selectedParticipantIds={selectedParticipantIds}
              selectionMode={isSingleMemberPick ? 'single' : 'multi'}
              onSelectedChange={setSelectedParticipantIds}
            />
          )}
        </AnimatedStep>
      </div>
    </Sheet>
  );
}
