'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CopyableValue } from '@/components/ui/CopyableValue';
import { PriceInput } from '@/components/ui/PriceInput';
import { Balance } from '@/components/ui/Balance';
import { AnimatedStep } from '@/components/ui/AnimatedStep';
import { PaymentParties, paymentHeadline } from '@/components/features/PaymentParties';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { expensesApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { assertOnline, mutationErrorMessage } from '@/lib/db/mutations';
import { partyLabel, realParticipantIds } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import { notifyEvent } from '@/lib/notify';
import { MBWAY_APP_URL, normalizeRevtag, revolutPaymentUrl, settleUpNote } from '@/lib/paymentLinks';
import { useGroup as useGroupRecord } from '@/lib/db/hooks';
import { cn } from '@/lib/utils';
import { PaymentLogo } from '@/components/ui/PaymentLogo';
import type { Expense, Party, PaymentMethod } from '@/lib/types';

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

/** "912345678" → "912 345 678" (só para mostrar; copia-se o original). */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, '');
  return /^\d{9}$/.test(digits) ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : phone;
}

interface MethodOption {
  key: PaymentMethod;
  label: string;
  hint: string;
  icon: IconName;
}

/** Métodos para pagar a `payee` — só as apps que ele tem no perfil, e
 *  "Outro" sempre. Sem nenhuma app, a lista fica só com "Outro" (e não se
 *  mostra: o método é `other` sem perguntar). */
function methodOptionsFor(payee: Party | undefined): MethodOption[] {
  const options: MethodOption[] = [];
  if (payee?.revtag) {
    options.push({ key: 'revolut', label: 'Revolut', hint: `@${normalizeRevtag(payee.revtag)}`, icon: 'credit_card' });
  }
  if (payee?.mbwayPhone) {
    options.push({ key: 'mbway', label: 'MB WAY', hint: `Envias para ${formatPhone(payee.mbwayPhone)}`, icon: 'phone_iphone' });
  }
  options.push({ key: 'other', label: 'Outro', hint: 'Dinheiro, transferência…', icon: 'attach_money' });
  return options;
}

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
  payment,
}: SettleUpSheetProps) {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [step, setStep] = useState<Step>({ kind: 'list' });
  /** Como é que TU vais pagar — só quando és tu o pagador (num pagamento
   *  recebido ou entre terceiros não sabemos, fica `other`). */
  const [method, setMethod] = useState<PaymentMethod>('other');
  /** +1 avança (entra pela direita), −1 volta (entra pela esquerda). */
  const [direction, setDirection] = useState(1);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  /** Para a nota do Revolut ("Saldar dívida de …"); sem grupo entre amigos. */
  const group = useGroupRecord(groupId);

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

  const noBalances = options.length === 0;

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
      // Sem saldos por acertar, a lista estaria vazia: vai direto a "Quem está
      // a pagar?" (o mesmo que "Mais opções") para registar um pagamento na mesma.
      setStep({ kind: noBalances ? 'pickPayer' : 'list' });
      setAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const label = (id: string) => partyLabel(id, parties);

  const forward = (next: Step) => {
    setDirection(1);
    setStep(next);
  };

  /** Entra na confirmação já com o método sugerido: se és tu a pagar, a
   *  primeira app que o recetor tem (Revolut, depois MB WAY); senão `other`. */
  const goToConfirm = (payerId: string, payeeId: string, via: 'list' | 'more') => {
    setMethod(payerId === currentUserId ? methodOptionsFor(parties.get(payeeId))[0].key : 'other');
    forward({ kind: 'confirm', payerId, payeeId, via });
  };

  const selectCounterparty = (option: CounterpartyOption) => {
    // amountCents > 0 → ele deve-te → ele paga (tu recebes).
    const iAmPayer = option.amountCents < 0;
    setAmount(Math.abs(fromCents(option.amountCents)));
    goToConfirm(iAmPayer ? currentUserId : option.id, iAmPayer ? option.id : currentUserId, 'list');
  };

  const selectPayee = (payerId: string, payeeId: string) => {
    // Sugere a dívida que já exista entre os dois (se houver).
    setAmount(fromCents(Math.max(0, pairwise[payerId]?.[payeeId] ?? 0)));
    goToConfirm(payerId, payeeId, 'more');
  };

  const goBack = () => {
    setDirection(-1);
    if (step.kind === 'pickPayer') {
      if (noBalances) return; // Sem lista para onde voltar.
      setStep({ kind: 'list' });
    }
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

      if (payment) {
        const saved = await expensesApi.update(
          payment.id,
          { amount, payers: [{ party: payerId, amount }], shares: [{ party: payeeId, amount }] },
          currentUserId,
          { expectedUpdated: payment.updated },
        );
        await db.expenses.put(saved);
        showToast('Pagamento atualizado', 'success');
        notifyEvent('expense.updated', saved.id);
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
          method: payerId === currentUserId ? method : 'other',
          created_by: currentUserId,
        });
        await db.expenses.put(created);
        showToast('Pagamento registado', 'success');
        notifyEvent('expense.created', created.id);
      }

      onSaved?.();

      // MB WAY: não há link com valor/número, por isso um diálogo diz o que
      // enviar e deixa copiar o número antes de abrir a app. (O Revolut não
      // passa por aqui: o próprio botão "Pagar" é o link — ver o rodapé.)
      const payee = parties.get(payeeId);
      if (!payment && payerId === currentUserId) {
        if (method === 'mbway' && payee?.mbwayPhone) {
          // O MB WAY não aceita valor nem número por link — só abre a app. O
          // diálogo diz o que enviar e deixa copiar o número antes de saltar.
          const phone = payee.mbwayPhone;
          await confirmAction({
            title: 'Envia o pagamento no MB WAY',
            description: `Deves enviar ${formatEUR(amount)} para o número ${formatPhone(phone)} no MB WAY.`,
            content: <CopyableValue value={phone.replace(/\s+/g, '')} display={formatPhone(phone)} label="Número MB WAY" />,
            icon: 'phone_iphone',
            confirmLabel: 'Abrir MB WAY',
            confirmHref: MBWAY_APP_URL,
            cancelLabel: 'Agora não',
          });
          onClose();
          return;
        }
      }
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

      {!payment && payerId === currentUserId && renderMethods(payeeId)}
    </div>
  );

  /** "Como vais pagar?" — só aparece se o recetor tiver Revolut e/ou MB WAY
   *  no perfil; sem nenhum, o pagamento fica `other` sem perguntar. */
  const renderMethods = (payeeId: string) => {
    const methodOptions = methodOptionsFor(parties.get(payeeId));
    if (methodOptions.length < 2) return null;
    return (
      <div role="radiogroup" aria-label="Como vais pagar?" className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Como vais pagar?</p>
        {methodOptions.map((option) => {
          const selected = method === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMethod(option.key)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors',
                selected ? 'border-primary-600 bg-primary-50 dark:bg-primary-950' : 'border-hairline bg-surface hover:bg-surface-sunken',
              )}
            >
              {option.key === 'other' ? (
                <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-sunken text-ink-soft flex items-center justify-center">
                  <Icon name={option.icon} className="text-xl" />
                </span>
              ) : (
                <PaymentLogo app={option.key} size="lg" variant="symbol" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-ink">{option.label}</span>
                <span className="block text-xs text-ink-soft truncate">{option.hint}</span>
              </span>
              <span
                className={cn(
                  'w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center',
                  selected ? 'border-primary-600' : 'border-hairline-strong',
                )}
              >
                {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

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

  /** Link do Revolut quando és tu a pagar por Revolut — o botão "Pagar"
   *  passa a ser este link (ver rodapé). */
  const revolutPayee = step.kind === 'confirm' ? parties.get(step.payeeId) : undefined;
  const revolutUrl =
    step.kind === 'confirm' &&
    !payment &&
    step.payerId === currentUserId &&
    method === 'revolut' &&
    revolutPayee?.revtag &&
    amount > 0
      ? revolutPaymentUrl(revolutPayee.revtag, amount, settleUpNote(group?.name))
      : null;

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
      onBack={
        step.kind === 'list' || (step.kind === 'pickPayer' && noBalances) || (step.kind === 'confirm' && step.via === 'edit')
          ? undefined
          : goBack
      }
      size="full"
      footerKey={step.kind}
      footer={
        step.kind === 'confirm' ? (
          revolutUrl ? (
            // Revolut: o botão "Pagar" É o link — um toque direto num `<a>` é
            // a única forma de o iOS abrir a app (universal link) em vez do
            // site. A gravação arranca no mesmo toque, em paralelo.
            <ButtonLink
              block
              size="lg"
              href={revolutUrl}
              target="_blank"
              rel="noopener noreferrer"
              disabled={amount <= 0 || submitting}
              onClick={(e) => {
                try {
                  assertOnline();
                } catch (error) {
                  // Sem rede não se regista — e não se deixa ir pagar sem registo.
                  e.preventDefault();
                  showToast(mutationErrorMessage(error, 'Sem ligação. Tenta outra vez.'), 'error');
                  return;
                }
                void handleSubmit();
              }}
            >
              {submitLabel}
            </ButtonLink>
          ) : (
            <Button block size="lg" loading={submitting} disabled={amount <= 0} onClick={handleSubmit}>
              {submitLabel}
            </Button>
          )
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
