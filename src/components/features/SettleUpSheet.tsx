'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PriceInput } from '@/components/ui/PriceInput';
import { Balance } from '@/components/ui/Balance';
import { useToast } from '@/context/ToastContext';
import { expensesApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { assertOnline, mutationErrorMessage } from '@/lib/db/mutations';
import { partyLabel, realParticipantIds } from '@/lib/parties';
import { fromCents } from '@/lib/ledger/money';
import { formatEUR } from '@/lib/money';
import { notify, notifiableUserIds } from '@/lib/notify';
import type { Party } from '@/lib/types';

interface SettleUpSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Omitido = acerto direto entre dois amigos, sem grupo (Fase 8). */
  groupId?: string;
  parties: Map<string, Party>;
  /** debtor → credor → cêntimos (já simplificado ou não, consoante o grupo). */
  pairwise: Record<string, Record<string, number>>;
  currentUserId: string;
  onSaved?: () => void;
  /** URL do pagamento para a notificação — por omissão a rota de grupo. */
  notifyUrl?: (expenseId: string) => string;
}

interface CounterpartyOption {
  id: string;
  /** Positivo = ele deve-te; negativo = tu deves-lhe. */
  amountCents: number;
}

export function SettleUpSheet({
  isOpen,
  onClose,
  groupId,
  parties,
  pairwise,
  currentUserId,
  onSaved,
  notifyUrl,
}: SettleUpSheetProps) {
  const { showToast } = useToast();
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [iAmPayer, setIAmPayer] = useState(true);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
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

  useEffect(() => {
    if (!isOpen) return;
    setCounterpartyId(null);
    setIAmPayer(true);
    setAmount(0);
    setDate(new Date().toISOString().slice(0, 10));
    setNote('');
  }, [isOpen]);

  const selectCounterparty = (option: CounterpartyOption) => {
    setCounterpartyId(option.id);
    // amountCents > 0 → ele deve-te → ele paga (tu recebes).
    setIAmPayer(option.amountCents < 0);
    setAmount(Math.abs(fromCents(option.amountCents)));
  };

  // MB WAY só faz sentido quando és tu a pagar e o recetor tem o número guardado.
  const receiverMbway = counterpartyId && iAmPayer ? parties.get(counterpartyId)?.mbwayPhone : undefined;

  const canSubmit = Boolean(counterpartyId) && amount > 0 && !submitting;

  const handleCopyMbway = async () => {
    if (!receiverMbway) return;
    try {
      await navigator.clipboard.writeText(receiverMbway);
      showToast('Número copiado', 'success');
    } catch {
      showToast('Não foi possível copiar', 'error');
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !counterpartyId) return;
    setSubmitting(true);
    try {
      assertOnline();
      const payerId = iAmPayer ? currentUserId : counterpartyId;
      const receiverId = iAmPayer ? counterpartyId : currentUserId;
      const created = await expensesApi.create({
        group_id: groupId,
        kind: 'payment',
        description: `Pagamento a ${partyLabel(receiverId, parties)}`,
        amount,
        date,
        notes: note.trim(),
        split_mode: 'equal',
        payers: [{ party: payerId, amount }],
        shares: [{ party: receiverId, amount }],
        participants: realParticipantIds([payerId, receiverId], parties),
        created_by: currentUserId,
      });
      await db.expenses.put(created);
      showToast('Pagamento registado', 'success');

      const receiverUserIds = notifiableUserIds([receiverId], parties, currentUserId);
      void notify({
        targetUserIds: receiverUserIds,
        title: '💸 Pagamento recebido',
        message: `${partyLabel(payerId, parties)} pagou-te ${formatEUR(amount)}.`,
        url: notifyUrl ? notifyUrl(created.id) : `/groups/${groupId}/expenses/${created.id}`,
      });

      onSaved?.();
      onClose();
    } catch (error) {
      showToast(mutationErrorMessage(error, 'Erro ao registar pagamento'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Acertar contas"
      size="full"
      footer={
        counterpartyId ? (
          <Button block loading={submitting} disabled={!canSubmit} onClick={handleSubmit}>
            Registar pagamento
          </Button>
        ) : undefined
      }
    >
      {!counterpartyId ? (
        options.length === 0 ? (
          <p className="text-sm text-ink-soft text-center py-8">Não tens saldos por acertar neste grupo.</p>
        ) : (
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
        )
      ) : (
        <div className="space-y-5 px-1">
          <div className="flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setIAmPayer(true)}
              className={iAmPayer ? 'font-bold text-primary-600' : 'text-ink-faint'}
            >
              Tu pagas
            </button>
            <Icon name="swap_horiz" className="text-ink-faint" />
            <button
              type="button"
              onClick={() => setIAmPayer(false)}
              className={!iAmPayer ? 'font-bold text-primary-600' : 'text-ink-faint'}
            >
              {partyLabel(counterpartyId, parties)} paga
            </button>
          </div>

          <p className="text-center text-sm text-ink-soft">
            {iAmPayer ? 'Tu' : partyLabel(counterpartyId, parties)} paga{' '}
            {iAmPayer ? partyLabel(counterpartyId, parties) : 'a ti'}
          </p>

          <PriceInput
            value={amount}
            onValueChange={setAmount}
            className="w-full px-4 py-3 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface text-2xl font-bold text-center"
          />

          {receiverMbway && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-sunken px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-faint uppercase tracking-wide">Pagar por MB WAY</p>
                <p className="text-sm font-semibold text-ink truncate">{receiverMbway}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleCopyMbway}>
                Copiar número
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-faint uppercase tracking-wide mb-1.5">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-faint uppercase tracking-wide mb-1.5">Nota</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCounterpartyId(null)}
            className="text-sm text-ink-faint hover:text-ink w-full text-center"
          >
            ← Escolher outra pessoa
          </button>
        </div>
      )}
    </Sheet>
  );
}
