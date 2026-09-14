import type { Expense } from '@/lib/types';

export type ActivityVerb = 'added' | 'updated' | 'deleted' | 'payment';

/** Tolerância entre `created` e `updated` para não classificar a própria
 *  gravação inicial (que sempre bate os dois campos a poucos ms um do outro)
 *  como uma edição. */
const EPS_MS = 2000;

/** O que aconteceu a uma despesa, para a Atividade — derivado dos campos que
 *  já existem (sem coleção de eventos própria): apagada, editada depois de
 *  criada, ou só criada. Um pagamento é sempre "payment", nunca "editado". */
export function activityVerb(expense: Expense): ActivityVerb {
  if (expense.deleted_at) return 'deleted';
  if (expense.kind === 'payment') return 'payment';
  const created = Date.parse(expense.created);
  const updated = Date.parse(expense.updated);
  if (Number.isFinite(created) && Number.isFinite(updated) && updated - created > EPS_MS) {
    return 'updated';
  }
  return 'added';
}

export interface ActivityItem {
  expense: Expense;
  verb: ActivityVerb;
  /** Data de referência para ordenar/mostrar — `deleted_at` se apagada, senão `updated`. */
  at: string;
  /** Quem fez a última ação relevante. */
  actorId: string | undefined;
}

/** Constrói e ordena (mais recente primeiro) os itens de atividade a partir
 *  de uma lista de despesas — de um grupo ou de todos (home global). */
export function buildActivityFeed(expenses: Expense[]): ActivityItem[] {
  return expenses
    .map((expense): ActivityItem => {
      const verb = activityVerb(expense);
      // Defensivo: `updated`/`created` são preenchidos pelo PocketBase, mas um
      // registo escrito por um script de migração pode não os trazer de volta
      // na resposta — nunca deixar isto rebentar o `sort` da Atividade.
      const at =
        (verb === 'deleted' ? expense.deleted_at : undefined) ??
        expense.updated ??
        expense.created ??
        '';
      return {
        expense,
        verb,
        at,
        actorId: verb === 'deleted' ? expense.deleted_by : verb === 'updated' ? expense.updated_by : expense.created_by,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
