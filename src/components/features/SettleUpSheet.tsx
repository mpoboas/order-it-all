'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PriceInput } from '@/components/ui/PriceInput';
import { Balance } from '@/components/ui/Balance';
import { AnimatedStep } from '@/components/ui/AnimatedStep';
import { PaymentParties, paymentHeadline } from '@/components/features/PaymentParties';
import { useToast } from '@/context/ToastContext';
import { expensesApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { assertOnline, mutationErrorMessage } from '@/lib/db/mutations';
import { partyLabel, realParticipantIds } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import { notify, notifiableUserIds } from '@/lib/notify';
import type { Expense, Party } from '@/lib/types';

interface SettleUpSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Omitido = acerto direto entre dois amigos, sem grupo (Fase 8). */
  groupId?: string;
  parties: Map<string, Party>;
  /** debtor → credor → cêntimos (já simplificado ou não, consoante o grupo).
   *  Dispensável ao editar um pagamento. */
  pairwise?: Record<string, Record<string, number>>;
  currentUserId: string;
  onSaved?: () => void;
  /** URL do pagamento para a notificação — por omissão a rota de grupo. */
  notifyUrl?: (expenseId: string) => string;
  /** Editar um pagamento já registado — abre direto no ecrã de confirmação
   *  (quem paga → quem recebe + valor), sem a lista. */
  payment?: Expense;
}

interface CounterpartyOption {
  id: string;
  /** Positivo = ele deve-te; negativo = tu deves-lhe. */
  amountCents: number;
}

/** Passos da folha: a lista das tuas dívidas → confirmação; ou "Mais opções"
 *  (pagamento entre outras duas pessoas) → quem paga → quem recebe →
 *  confirmação. `edit` = confirmação de um pagamento já existente. */
type Step =
  | { kind: 'list' }
  | { kind: 'pickPayer' }
  | { kind: 'pickPayee'; payerId: string }
  | { kind: 'confirm'; payerId: string; payeeId: string; via: 'list' | 'more' | 'edit' };

const NO_PAIRWISE: Record<string, Record<string, number>> = {};

/**
 * Acertar contas. Escolher uma pessoa da lista leva a um ecrã só com o
 * essencial: os dois avatares com uma seta de quem paga (esquerda) para quem
 * recebe (direita), a frase ("Miguel pagou-te" / "Estás a pagar a Miguel"), o
 * valor e o botão. "Mais opções" regista um pagamento entre outras duas
 * pessoas do grupo (nem pagaste tu, nem te pagaram a ti). Cada passo entra a
 * deslizar da direita (e volta pela esquerda), como nos outros assistentes.
 */
export function SettleUpSheet({
  isOpen,
  onClose,
  groupId,
  parties,
  pairwise = NO_PAIRWISE,
  currentUserId,
  onSaved,
  notifyUrl,
  payment,
}: SettleUpSheetProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>({ kind: 'list' });
  /** +1 avança (entra pela direita), −1 volta (entra pela esquerda). */
  const [direction, setDirection] = useState(1);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const options = useMemo((): CounterpartyOption[] => {
    const result: CounterpartyOption[] = [];
    for (const [creditor, amountCents] of Object.entries(pairwise[currentUserId] ?? {})) {
      if (amountCents > 0) result.push({ id: creditor, amountCents: -amountCents });
    }
    for (const [debtor, creditors] of Object.entries(pairwise)) {
      const amountCents = creditors[currentUserId];
      if (amountCents > 0) result.push({ id: debtor, amountCents });
    }
    return result.sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));
  }, [pairwise, currentUserId]);

  /** Toda a gente que pode pagar/receber — um placeholder já reclamado é
   *  representado pelo utilizador que o reclamou. Tu primeiro. */
  const people = useMemo(
    () =>
      Array.from(parties.values())
        .filter((p) => !p.claimedBy)
        .sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0)),
    [parties, currentUserId],
  );

  useEffect(() => {
    if (!isOpen) return;
    setDirection(1);
    if (payment) {
      setStep({
        kind: 'confirm',
        payerId: payment.payers[0]?.party ?? currentUserId,
        payeeId: payment.shares[0]?.party ?? currentUserId,
        via: 'edit',
      });
      setAmount(payment.amount);
    } else {
      setStep({ kind: 'list' });
      setAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const label = (id: string) => partyLabel(id, parties);

  const forward = (next: Step) => {
    setDirection(1);
    setStep(next);
  };

  const selectCounterparty = (option: CounterpartyOption) => {
    // amountCents > 0 → ele deve-te → ele paga (tu recebes).
    const iAmPayer = option.amountCents < 0;
    setAmount(Math.abs(fromCents(option.amountCents)));
    forward({
      kind: 'confirm',
      payerId: iAmPayer ? currentUserId : option.id,
      payeeId: iAmPayer ? option.id : currentUserId,
      via: 'list',
    });
  };

  const selectPayee = (payerId: string, payeeId: string) => {
    // Sugere a dívida que já exista entre os dois (se houver).
    setAmount(fromCents(Math.max(0, pairwise[payerId]?.[payeeId] ?? 0)));
    forward({ kind: 'confirm', payerId, payeeId, via: 'more' });
  };

  const goBack = () => {
    setDirection(-1);
    if (step.kind === 'pickPayer') setStep({ kind: 'list' });
    else if (step.kind === 'pickPayee') setStep({ kind: 'pickPayer' });
    else if (step.kind === 'confirm') {
      setStep(step.via === 'more' ? { kind: 'pickPayee', payerId: step.payerId } : { kind: 'list' });
    }
  };

  const handleSubmit = async () => {
    if (step.kind !== 'confirm' || amount <= 0 || submitting) return;
    const { payerId, payeeId } = step;
    setSubmitting(true);
    try {
      assertOnline();
      const url = (id: string) => (notifyUrl ? notifyUrl(id) : `/groups/${groupId}/expenses/${id}`);

      if (payment) {
        const saved = await expensesApi.update(
          payment.id,
          { amount, payers: [{ party: payerId, amount }], shares: [{ party: payeeId, amount }] },
          currentUserId,
          { expectedUpdated: payment.updated },
        );
        await db.expenses.put(saved);
        showToast('Pagamento atualizado', 'success');
        void notify({
          targetUserIds: notifiableUserIds([payerId, payeeId], parties, currentUserId),
          title: '✏️ Pagamento editado',
          message: `${label(currentUserId)} editou um pagamento — ${formatEUR(amount)}.`,
          url: url(saved.id),
        });
      } else {
        const created = await expensesApi.create({
          group_id: groupId,
          kind: 'payment',
          description: `Pagamento a ${label(payeeId)}`,
          amount,
          date: new Date().toISOString().slice(0, 10),
          notes: '',
          split_mode: 'equal',
          payers: [{ party: payerId, amount }],
          shares: [{ party: payeeId, amount }],
          participants: realParticipantIds([payerId, payeeId], parties),
          created_by: currentUserId,
        });
        await db.expenses.put(created);
        showToast('Pagamento registado', 'success');
        void notify({
          targetUserIds: notifiableUserIds([payeeId], parties, currentUserId),
          title: '💸 Pagamento recebido',
          message: `${label(payerId)} pagou-te ${formatEUR(amount)}.`,
          url: url(created.id),
        });
      }

      onSaved?.();
      onClose();
    } catch (error) {
      showToast(
        mutationErrorMessage(error, payment ? 'Erro ao guardar o pagamento' : 'Erro ao registar pagamento'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    step.kind === 'pickPayer'
      ? 'Quem está a pagar?'
      : step.kind === 'pickPayee'
        ? 'Quem está a ser pago?'
        : payment
          ? 'Editar pagamento'
          : 'Acertar contas';

  const renderPeoplePicker = (exclude: string | null, onPick: (id: string) => void) => (
    <ul className="divide-y divide-hairline">
      {people
        .filter((p) => p.id !== exclude)
        .map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              className="w-full flex items-center gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors"
            >
              <Avatar name={p.name} src={p.avatar} size="sm" />
              <span className="flex-1 min-w-0 font-medium text-ink truncate">
                {p.name}
                {p.id === currentUserId && <span className="text-ink-faint font-normal"> (tu)</span>}
              </span>
              <Icon name="chevron_right" className="text-ink-faint" />
            </button>
          </li>
        ))}
    </ul>
  );

  const renderConfirm = (payerId: string, payeeId: string) => (
    <div className="space-y-6 px-1 pt-4">
      <PaymentParties payerId={payerId} payeeId={payeeId} parties={parties} currentUserId={currentUserId} />

      <p className="text-center text-lg font-semibold text-ink">
        {paymentHeadline(payerId, payeeId, parties, currentUserId, !payment)}
      </p>

      <PriceInput
        value={amount}
        onValueChange={setAmount}
        aria-label="Valor do pagamento"
        className="w-full px-4 py-3 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface text-3xl font-bold tracking-tight text-center tabular-nums"
      />
    </div>
  );

  const renderList = () =>
    options.length === 0 ? (
      <p className="text-sm text-ink-soft text-center py-8">Não tens saldos por acertar.</p>
    ) : (
      <>
        <ul className="divide-y divide-hairline">
          {options.map((opt) => {
            const party = parties.get(opt.id);
            if (!party) return null;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => selectCounterparty(opt)}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors"
                >
                  <Avatar name={party.name} src={party.avatar} size="sm" />
                  <span className="flex-1 font-medium text-ink truncate">{party.name}</span>
                  <Balance cents={opt.amountCents} labels={{ pos: 'deve-te', neg: 'deves' }} />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => forward({ kind: 'pickPayer' })}
          className="mt-4 w-full py-2.5 rounded-full border border-hairline-strong text-sm font-semibold text-ink-soft hover:bg-surface-sunken transition-colors"
        >
          Mais opções
        </button>
      </>
    );

  const submitLabel = payment
    ? 'Guardar'
    : step.kind === 'confirm' && step.payerId === currentUserId
      ? `Pagar ${formatEUR(amount)} a ${label(step.payeeId)}`
      : 'Registar pagamento';

  const stepKey =
    step.kind === 'pickPayee' ? `pickPayee:${step.payerId}` : step.kind === 'confirm' ? `confirm:${step.payerId}:${step.payeeId}` : step.kind;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      onBack={step.kind === 'list' || (step.kind === 'confirm' && step.via === 'edit') ? undefined : goBack}
      size="full"
      footerKey={step.kind}
      footer={
        step.kind === 'confirm' ? (
          <Button block size="lg" loading={submitting} disabled={amount <= 0} onClick={handleSubmit}>
            {submitLabel}
          </Button>
        ) : undefined
      }
    >
      <AnimatedStep stepKey={stepKey} direction={direction}>
        {step.kind === 'list' && renderList()}
        {step.kind === 'pickPayer' && renderPeoplePicker(null, (id) => forward({ kind: 'pickPayee', payerId: id }))}
        {step.kind === 'pickPayee' && renderPeoplePicker(step.payerId, (id) => selectPayee(step.payerId, id))}
        {step.kind === 'confirm' && renderConfirm(step.payerId, step.payeeId)}
      </AnimatedStep>
    </Sheet>
  );
}
