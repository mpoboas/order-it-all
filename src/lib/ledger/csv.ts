import type { Expense, Party } from '@/lib/types';
import { partyLabel } from '@/lib/parties';
import { getCategory } from './categories';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV de despesas de um grupo (Fase 6) — uma linha por despesa, colunas
 *  fixas em português. Pagamentos entram com "Pagamento" na coluna Tipo. */
export function expensesToCsv(expenses: Expense[], parties: Map<string, Party>): string {
  const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (€)', 'Pago por', 'Notas'];
  const rows = expenses
    .filter((e) => !e.deleted_at)
    .map((e) => {
      const payerNames = e.payers.map((p) => partyLabel(p.party, parties)).join(' + ') || 'Falta pagador';
      const category = e.kind === 'payment' ? '' : getCategory(e.category).label;
      return [
        e.date.slice(0, 10),
        e.kind === 'payment' ? 'Pagamento' : 'Despesa',
        e.description,
        category,
        e.amount.toFixed(2),
        payerNames,
        e.notes ?? '',
      ];
    });
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}
