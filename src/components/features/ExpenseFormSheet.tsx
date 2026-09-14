'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { PriceInput } from '@/components/ui/PriceInput';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PayerPickerSheet } from '@/components/features/PayerPickerSheet';
import { SplitModeSheet, type SplitModeResult } from '@/components/features/SplitModeSheet';
import { CategoryPickerSheet } from '@/components/features/CategoryPickerSheet';
import { expensesApi, splitsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { assertOnline, mutationErrorMessage } from '@/lib/db/mutations';
import { useToast } from '@/context/ToastContext';
import { guessCategory } from '@/lib/ledger/categories';
import { computeShares, type ComputableSplitMode } from '@/lib/ledger/shares';
import { toCents, fromCents } from '@/lib/ledger/money';
import { partyLabel, realParticipantIds } from '@/lib/parties';
import { notify, notifiableUserIds } from '@/lib/notify';
import { formatEUR } from '@/lib/money';
import type { Expense, ExpensePayer, ExpenseSplitMode, Party } from '@/lib/types';

interface ExpenseFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Omitido = despesa direta entre amigos, sem grupo (Fase 8) — desativa o
   *  modo "Itens" (precisa de um `Split`, sempre acoplado a um grupo). */
  groupId?: string;
  parties: Map<string, Party>;
  currentUserId: string;
  expense?: Expense | null;
  onSaved: (expense: Expense) => void;
  /** Chamado depois de criar/gravar uma despesa itemizada — navega para o
   *  sub-ecrã de itens. */
  onOpenItems?: (expense: Expense) => void;
  /** URL da despesa gravada, para a notificação — por omissão a rota de
   *  grupo; despesas diretas passam a sua própria (`/expenses/[id]`). */
  notifyUrl?: (expense: Expense) => string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormSheet({
  isOpen,
  onClose,
  groupId,
  parties,
  currentUserId,
  expense,
  onSaved,
  onOpenItems,
  notifyUrl,
}: ExpenseFormSheetProps) {
  const { showToast } = useToast();
  const isEditing = Boolean(expense);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState('other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [payers, setPayers] = useState<ExpensePayer[]>([]);
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equal');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitInputs, setSplitInputs] = useState<Record<string, number>>({});

  const [showPayerSheet, setShowPayerSheet] = useState(false);
  const [showSplitSheet, setShowSplitSheet] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allParties = Array.from(parties.values());

  useEffect(() => {
    if (!isOpen) return;
    if (expense) {
      setDescription(expense.description);
      setAmount(expense.amount);
      setDate(expense.date.slice(0, 10));
      setCategory(expense.category || 'other');
      setCategoryTouched(true);
      setNotes(expense.notes || '');
      setPayers(expense.payers);
      setSplitMode(expense.split_mode);
      setParticipantIds(expense.shares.map((s) => s.party));
      setSplitInputs(Object.fromEntries(expense.shares.map((s) => [s.party, s.input ?? 0])));
    } else {
      setDescription('');
      setAmount(0);
      setDate(todayIso());
      setCategory('other');
      setCategoryTouched(false);
      setNotes('');
      setPayers(currentUserId ? [{ party: currentUserId, amount: 0 }] : []);
      setSplitMode('equal');
      setParticipantIds(Array.from(parties.keys()));
      setSplitInputs({});
    }
  }, [isOpen, expense, currentUserId, parties]);

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    if (!categoryTouched) setCategory(guessCategory(value));
  };

  const handleAmountChange = (value: number) => {
    setAmount(value);
    // Um só pagador: mantém sempre o valor total (o caso comum). Vários
    // pagadores têm de ser reajustados manualmente — não sabemos como repartir.
    setPayers((prev) => (prev.length === 1 ? [{ ...prev[0], amount: value }] : prev));
  };

  const payerSummary =
    payers.length === 0
      ? 'ninguém'
      : payers.length === 1
        ? partyLabel(payers[0].party, parties)
        : `${payers.length} pessoas`;

  const splitSummary =
    splitMode === 'itemized'
      ? 'itens'
      : splitMode === 'equal'
        ? 'igualmente'
        : getCategoryModeLabel(splitMode);

  function getCategoryModeLabel(mode: ExpenseSplitMode): string {
    switch (mode) {
      case 'exact': return 'por valores exatos';
      case 'percentage': return 'por percentagem';
      case 'shares': return 'por quotas';
      case 'adjustment': return 'com ajuste';
      default: return 'igualmente';
    }
  }

  const canSubmit = description.trim().length > 0 && amount > 0 && payers.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      assertOnline();
      const amountCents = toCents(amount);

      let sharesPayload: Expense['shares'];
      if (splitMode === 'itemized') {
        sharesPayload = expense?.shares ?? [];
      } else {
        const ids = splitMode === 'equal' ? participantIds : allParties.map((p) => p.id);
        const { shares, error } = computeShares(splitMode as ComputableSplitMode, amountCents, ids, splitInputs);
        if (error) {
          showToast(error, 'error');
          setSubmitting(false);
          return;
        }
        sharesPayload = shares.map((s) => ({ party: s.party, amount: fromCents(s.amountCents), input: s.input }));
      }

      const notifyPartyIdsForSave = Array.from(new Set([...payers.map((p) => p.party), ...sharesPayload.map((s) => s.party)]));
      const base = {
        description: description.trim(),
        amount,
        date,
        category,
        notes: notes.trim(),
        split_mode: splitMode,
        payers,
        shares: sharesPayload,
        participants: realParticipantIds(notifyPartyIdsForSave, parties),
      };

      let saved: Expense;
      if (isEditing && expense) {
        saved = await expensesApi.update(expense.id, base, currentUserId);
      } else {
        saved = await expensesApi.create({
          group_id: groupId,
          ...base,
          created_by: currentUserId,
        });
      }
      await db.expenses.put(saved);

      if (splitMode === 'itemized' && !saved.split_id && groupId) {
        const split = await splitsApi.create({
          name: description.trim(),
          group_id: groupId,
          created_by: currentUserId,
          participants: participantIds.length ? participantIds : allParties.map((p) => p.id),
        });
        saved = await expensesApi.update(saved.id, { split_id: split.id }, currentUserId);
        await db.expenses.put(saved);
      }

      onSaved(saved);
      if (splitMode === 'itemized') onOpenItems?.(saved);
      onClose();

      const notifyPartyIds = Array.from(
        new Set([...saved.payers.map((p) => p.party), ...saved.shares.map((s) => s.party)]),
      );
      const targets = notifiableUserIds(notifyPartyIds, parties, currentUserId);
      void notify({
        targetUserIds: targets,
        title: isEditing ? '✏️ Despesa editada' : '💰 Nova despesa',
        message: `${partyLabel(currentUserId, parties)} ${isEditing ? 'editou' : 'adicionou'} "${saved.description}" — ${formatEUR(saved.amount)}.`,
        url: notifyUrl ? notifyUrl(saved) : `/groups/${groupId}/expenses/${saved.id}`,
      });
    } catch (error) {
      showToast(mutationErrorMessage(error, 'Erro ao guardar despesa'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const payerParties = allParties; // qualquer parte do grupo pode ter pago

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? 'Editar despesa' : 'Nova despesa'}
        size="full"
        footer={
          <Button block loading={submitting} disabled={!canSubmit} onClick={handleSubmit}>
            Guardar
          </Button>
        }
      >
        <div className="space-y-5 px-1 pb-2">
          <div className="flex items-center gap-3">
            <CategoryIcon category={category} size="lg" onClick={() => setShowCategorySheet(true)} />
            <div className="flex-1 min-w-0 space-y-2">
              <input
                type="text"
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Descrição (ex. Jantar)"
                autoFocus
                className="w-full px-3 py-2 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface transition-colors text-base font-medium"
              />
            </div>
          </div>

          <PriceInput
            value={amount}
            onValueChange={handleAmountChange}
            className="w-full px-4 py-3 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface text-2xl font-bold text-center"
          />

          <p className="text-center text-sm text-ink-soft">
            Pago por{' '}
            <button type="button" onClick={() => setShowPayerSheet(true)} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              {payerSummary}
            </button>
            {' '}e dividido{' '}
            <button type="button" onClick={() => setShowSplitSheet(true)} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
              {splitSummary}
            </button>
          </p>

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
              <label className="block text-xs font-bold text-ink-faint uppercase tracking-wide mb-1.5">Notas</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-hairline focus:border-primary-500 outline-none bg-surface-sunken focus:bg-surface"
              />
            </div>
          </div>
        </div>
      </Sheet>

      <PayerPickerSheet
        isOpen={showPayerSheet}
        onClose={() => setShowPayerSheet(false)}
        parties={payerParties}
        totalAmount={amount}
        payers={payers}
        onConfirm={setPayers}
      />

      <SplitModeSheet
        isOpen={showSplitSheet}
        onClose={() => setShowSplitSheet(false)}
        parties={allParties}
        totalAmount={amount}
        mode={splitMode}
        participantIds={participantIds}
        inputs={splitInputs}
        allowItemized={Boolean(groupId)}
        onConfirm={(result: SplitModeResult) => {
          setSplitMode(result.mode);
          setParticipantIds(result.participantIds);
          setSplitInputs(result.inputs);
        }}
      />

      <CategoryPickerSheet
        isOpen={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        value={category}
        onSelect={(id) => {
          setCategory(id);
          setCategoryTouched(true);
        }}
      />
    </>
  );
}
