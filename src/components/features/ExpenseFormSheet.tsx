'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { PriceInput } from '@/components/ui/PriceInput';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PayerPickerSheet } from '@/components/features/PayerPickerSheet';
import { SplitModeSheet, type SplitModeResult } from '@/components/features/SplitModeSheet';
import { CategoryPickerSheet } from '@/components/features/CategoryPickerSheet';
import { expensesApi, splitsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { assertOnline, isConflictError, mutationErrorMessage } from '@/lib/db/mutations';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { guessCategory } from '@/lib/ledger/categories';
import { computeShares, type ComputableSplitMode } from '@/lib/ledger/shares';
import { toCents, fromCents } from '@/lib/ledger/money';
import { partyLabel, realParticipantIds } from '@/lib/parties';
import { notifyEvent } from '@/lib/notify';
import { formatEUR } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
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
}: ExpenseFormSheetProps) {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const isEditing = Boolean(expense);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState('other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [payers, setPayers] = useState<ExpensePayer[]>([]);
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equal');
  // Numa despesa por itens já gravada, o total é a soma dos itens — não se
  // escreve à mão (mudá-lo aqui só era recusado ao gravar). Ao criar continua
  // editável: é o valor provisório até haver itens.
  const totalFromItems = isEditing && expense?.split_mode === 'itemized' && splitMode === 'itemized';
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitInputs, setSplitInputs] = useState<Record<string, number>>({});

  const [showPayerSheet, setShowPayerSheet] = useState(false);
  const [showSplitSheet, setShowSplitSheet] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allParties = Array.from(parties.values());

  // Versão (`updated`) da despesa que se abriu para editar — controlo de
  // concorrência otimista: vai no pedido como `expected_updated` e o servidor
  // recusa (409) se outra pessoa gravou entretanto.
  const [baseUpdated, setBaseUpdated] = useState<string | null>(null);

  const loadFrom = useCallback((exp: Expense) => {
    setDescription(exp.description);
    setAmount(exp.amount);
    setDate(exp.date.slice(0, 10));
    setCategory(exp.category || 'other');
    setCategoryTouched(true);
    setNotes(exp.notes || '');
    setPayers(exp.payers);
    setSplitMode(exp.split_mode);
    setParticipantIds(exp.shares.map((s) => s.party));
    setSplitInputs(Object.fromEntries(exp.shares.map((s) => [s.party, s.input ?? 0])));
    setBaseUpdated(exp.updated);
  }, []);

  // Preenche o formulário SÓ ao abrir (ou ao mudar de despesa) — antes o efeito
  // dependia do objeto `expense`, e uma gravação de outra pessoa a chegar por
  // realtime repunha o formulário em silêncio, apagando o que se estava a
  // escrever. Agora isso aparece como aviso (`changedUnderneath`).
  const latest = useRef({ expense, parties, currentUserId });
  useEffect(() => {
    latest.current = { expense, parties, currentUserId };
  });
  // Numa despesa nova, `parties.size` no key: se as partes só chegarem depois
  // de abrir, a lista de participantes por omissão ainda as apanha.
  const openKey = isOpen ? (expense?.id ?? `new:${parties.size}`) : null;
  useEffect(() => {
    if (openKey === null) return;
    const { expense: exp, parties: ps, currentUserId: uid } = latest.current;
    if (exp) {
      loadFrom(exp);
      return;
    }
    setDescription('');
    setAmount(0);
    setDate(todayIso());
    setCategory('other');
    setCategoryTouched(false);
    setNotes('');
    setPayers(uid ? [{ party: uid, amount: 0 }] : []);
    setSplitMode('equal');
    setParticipantIds(Array.from(ps.keys()));
    setSplitInputs({});
    setBaseUpdated(null);
  }, [openKey, loadFrom]);

  // Outra pessoa gravou/apagou esta despesa enquanto o formulário está aberto
  // (chega por realtime via Dexie) — avisa já, antes de o 409 acontecer.
  const changedUnderneath = isEditing && !!expense && !!baseUpdated && expense.updated !== baseUpdated;
  const deletedUnderneath = isEditing && !!expense?.deleted_at;
  const changedBy =
    expense?.updated_by && expense.updated_by !== currentUserId ? partyLabel(expense.updated_by, parties) : null;

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

  // Invariante do livro-razão: o que os pagadores pagaram tem de ser
  // exatamente o total (em cêntimos). Com vários pagadores o `handleAmountChange`
  // não sabe como repartir uma mudança de total — sem esta guarda gravava-se
  // uma despesa cujos saldos deixam de somar zero.
  const payersCents = payers.reduce((sum, p) => sum + toCents(p.amount), 0);
  const payersMatch = payersCents === toCents(amount);

  const canSubmit =
    description.trim().length > 0 && amount > 0 && payers.length > 0 && payersMatch && !deletedUnderneath && !submitting;

  /** `expectedUpdated` por omissão = a versão que se abriu; "Gravar por cima"
   *  passa a versão atual (decisão explícita de substituir a alteração do outro). */
  const handleSubmit = async (expectedUpdated: string | null = baseUpdated) => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      assertOnline();
      const amountCents = toCents(amount);

      let sharesPayload: Expense['shares'];
      if (splitMode === 'itemized') {
        sharesPayload = expense?.shares ?? [];
        // Editar o total de uma despesa por itens não recalcula as partes
        // (vêm dos itens) — não gravar partes que já não somam o total.
        const sharesCents = sharesPayload.reduce((sum, s) => sum + toCents(s.amount), 0);
        if (isEditing && sharesCents !== amountCents) {
          showToast('O total mudou. Revê a divisão por itens antes de gravar.', 'error');
          setSubmitting(false);
          return;
        }
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
        saved = await expensesApi.update(expense.id, base, currentUserId, {
          expectedUpdated: expectedUpdated ?? undefined,
        });
        setBaseUpdated(saved.updated); // a nossa gravação não é "alteração de outra pessoa"
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
      // Só ao criar: acabou de nascer, falta distribuir os itens. Ao editar
      // (pagadores, data, notas…) fica-se onde se estava — "Ver itens" está
      // ao lado do total para quem quiser lá ir.
      if (splitMode === 'itemized' && !isEditing) onOpenItems?.(saved);
      onClose();

      notifyEvent(isEditing ? 'expense.updated' : 'expense.created', saved.id);
    } catch (error) {
      if (isConflictError(error) && expense) {
        // Traz já a versão atual para o Dexie (o realtime pode vir atrasado),
        // para o aviso e o "Carregar a versão atual" mostrarem o que mudou.
        try {
          await db.expenses.put(await expensesApi.getById(expense.id));
        } catch {
          // sem rede / sem acesso — o aviso fica com o que o realtime trouxer
        }
        // Só "carregar" ou "voltar" — nunca "gravar por cima" como resposta a
        // um diálogo que também se fecha com Escape/fundo. Gravar por cima é
        // um botão explícito no aviso do formulário.
        const load = await confirmAction({
          title: mutationErrorMessage(error, 'Esta despesa foi alterada por outra pessoa entretanto.'),
          description:
            'Carrega a versão atual para veres o que mudou (perdes o que alteraste aqui), ou volta ao formulário. No aviso lá em cima podes escolher gravar por cima.',
          confirmLabel: 'Carregar a versão atual',
          cancelLabel: 'Voltar ao formulário',
          tone: 'warning',
        });
        if (load) {
          const current = await db.expenses.get(expense.id);
          if (current) loadFrom(current);
        }
        return;
      }
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
          <Button block loading={submitting} disabled={!canSubmit} onClick={() => handleSubmit()}>
            Guardar
          </Button>
        }
      >
        <div className="space-y-5 px-1 pb-2">
          {(changedUnderneath || deletedUnderneath) && (
            <div role="alert" className="rounded-2xl bg-warning-bg text-warning-fg px-4 py-3 text-sm">
              <p className="font-semibold">
                {deletedUnderneath
                  ? 'Esta despesa foi apagada entretanto e já não pode ser gravada.'
                  : `${changedBy ?? 'Alguém'} alterou esta despesa enquanto editavas.`}
              </p>
              {!deletedUnderneath && expense && (
                <>
                  <p className="mt-0.5">Se gravares agora, a alteração dessa pessoa é substituída pela tua.</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    <button type="button" onClick={() => loadFrom(expense)} className="font-semibold underline underline-offset-2">
                      Carregar a versão atual
                    </button>
                    <button
                      type="button"
                      disabled={!canSubmit}
                      onClick={() => handleSubmit(expense.updated)}
                      className="font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                      Gravar por cima
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
            readOnly={totalFromItems}
            aria-label="Total da despesa"
            aria-describedby={splitMode === 'itemized' ? 'expense-total-hint' : undefined}
            className={cn(
              'w-full px-4 py-3 rounded-xl border-2 border-hairline outline-none bg-surface-sunken text-2xl font-bold text-center',
              totalFromItems ? 'text-ink-soft cursor-default' : 'focus:border-primary-500 focus:bg-surface',
            )}
          />
          {splitMode === 'itemized' && (
            <p id="expense-total-hint" className="flex items-center justify-center gap-1.5 text-xs text-ink-faint">
              {totalFromItems ? (
                <>
                  <Icon name="lock" size={14} />
                  O total vem dos itens.
                  {expense && onOpenItems && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenItems(expense);
                        onClose();
                      }}
                      className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Ver itens
                    </button>
                  )}
                </>
              ) : (
                'Valor provisório. O total final vem dos itens.'
              )}
            </p>
          )}

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

          {!payersMatch && amount > 0 && payers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPayerSheet(true)}
              className="block w-full text-center text-sm font-semibold text-warning-fg"
            >
              Os pagadores somam {formatEUR(fromCents(payersCents))} de {formatEUR(amount)}. Ajustar
            </button>
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
