'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { apiFetch } from '@/lib/apiClient';
import { formatCurrency, cn } from '@/lib/utils';
import type { Split } from '@/lib/types';
import type { SplitwiseMemberCache } from '@/lib/types';
import { memberDisplayName } from '@/lib/splitwiseMapping';
import { useToast } from '@/context/ToastContext';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

interface SplitwiseExportSheetProps {
  isOpen: boolean;
  onClose: () => void;
  split: Split;
  onExported: (split: Split) => void;
}

export function SplitwiseExportSheet({
  isOpen,
  onClose,
  split,
  onExported,
}: SplitwiseExportSheetProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [members, setMembers] = useState<SplitwiseMemberCache[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [grandTotal, setGrandTotal] = useState(0);
  const [map, setMap] = useState<Record<string, number>>({});
  const [payerName, setPayerName] = useState('');
  const [alreadyExported, setAlreadyExported] = useState(false);
  const [expenseId, setExpenseId] = useState<number | null>(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/splits/${split.id}/splitwise/preview`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'preview');
      }
      const data = await res.json();
      if (!data.connected || !data.splitwiseGroupId) {
        showToast('Liga o Splitwise nas definições do grupo', 'error');
        onClose();
        return;
      }
      setMembers(data.members ?? []);
      setTotals(data.totals ?? {});
      setGrandTotal(data.grandTotal ?? 0);
      setMap(data.suggestedMap ?? {});
      setAlreadyExported(data.exported);
      setExpenseId(data.expenseId ?? null);

      const firstMapped = split.participants.find((p) => data.suggestedMap?.[p]);
      if (firstMapped) setPayerName(firstMapped);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Erro ao carregar preview',
        'error'
      );
      onClose();
    } finally {
      setLoading(false);
    }
  }, [split.id, split.participants, showToast, onClose]);

  useEffect(() => {
    if (isOpen) loadPreview();
  }, [isOpen, loadPreview]);

  const allMapped = split.participants.every((p) => map[p] > 0);

  const handleExport = async (force = false) => {
    if (!payerName || !allMapped) return;
    setExporting(true);
    try {
      const res = await apiFetch(`/api/splits/${split.id}/splitwise/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantMap: map,
          payerParticipantName: payerName,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && !force) {
        if (
          confirm(
            'Esta divisão já foi exportada. Criar outra despesa no Splitwise?'
          )
        ) {
          setExporting(false);
          return handleExport(true);
        }
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'export');
      }
      showToast('Exportado para Splitwise!', 'success');
      onExported({
        ...split,
        splitwise_participant_map: map,
        splitwise_expense_id: data.expenseId,
        splitwise_exported_at: new Date().toISOString(),
        status: 'closed',
        share_active: false,
      });
      if (data.url) window.open(data.url, '_blank');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao exportar', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Enviar para Splitwise"
      subtitle="Uma despesa com o total e a quota de cada pessoa"
      size="large"
      footer={
        <button
          type="button"
          disabled={exporting || loading || !allMapped || !payerName}
          onClick={() => handleExport(false)}
          className="btn btn-primary w-full py-3 disabled:opacity-50"
        >
          {exporting ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" /> A exportar…
            </span>
          ) : (
            'Criar despesa no Splitwise'
          )}
        </button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="space-y-5 px-1">
          {alreadyExported && expenseId && (
            <p className="text-sm text-[var(--text-secondary)]">
              Já exportado (despesa #{expenseId}). Exportar de novo cria outra
              entrada.
            </p>
          )}

          <div className="flex justify-between text-sm font-semibold">
            <span>Total a dividir</span>
            <span className="text-violet-600">{formatCurrency(grandTotal)}</span>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Quem pagou a conta?</p>
            <div className="flex flex-wrap gap-2">
              {split.participants.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPayerName(name)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border',
                    payerName === name
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'border-[var(--border)]'
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Mapear para Splitwise</p>
            <ul className="space-y-3 max-h-[min(50vh,320px)] overflow-y-auto">
              {split.participants.map((name) => (
                <li key={name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-violet-600">
                      {formatCurrency(totals[name] ?? 0)}
                    </span>
                  </div>
                  <select
                    value={map[name] ?? ''}
                    onChange={(e) =>
                      setMap((m) => ({
                        ...m,
                        [name]: Number(e.target.value),
                      }))
                    }
                    className="w-full h-9 px-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm"
                  >
                    <option value="">Seleccionar membro…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {memberDisplayName(m)}
                        {m.email ? ` (${m.email})` : ''}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}
