import type { Table, UpdateSpec } from 'dexie';
import { db } from './schema';

/**
 * Primitivas de escrita optimista. Sem outbox: a escrita **exige rede**. O que
 * fica optimista é o efeito na cache local (Dexie) para o feel instantâneo; em
 * falha reverte-se. O eco do realtime que chega a seguir confirma/afina.
 */

export class OfflineError extends Error {
  constructor(message = 'Sem ligação à internet') {
    super(message);
    this.name = 'OfflineError';
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Lança `OfflineError` se não houver rede (para creates / ações de peso). */
export function assertOnline(): void {
  if (isOffline()) throw new OfflineError();
}

/** Mensagem amigável para um erro de mutação (offline vs erro do servidor). */
export function mutationErrorMessage(err: unknown, fallback = 'Ocorreu um erro.'): string {
  if (err instanceof OfflineError || isOffline()) {
    return 'Sem ligação — tenta outra vez quando tiveres rede.';
  }
  const e = err as { data?: { message?: string }; message?: string } | undefined;
  return e?.data?.message || e?.message || fallback;
}

type Row = { id: string };

interface OptimisticEditArgs<T extends Row> {
  table: Table<T, string>;
  id: string;
  /** Alteração a aplicar já na cache (merge shallow). */
  patch: Partial<T>;
  /** A chamada `*Api.*` real. */
  commit: () => Promise<unknown>;
}

/**
 * Aplica `patch` ao Dexie já, chama `commit()`, e em falha repõe o registo
 * anterior. Rethrow — o caller mostra o Toast (`mutationErrorMessage`).
 */
export async function optimisticEdit<T extends Row>(
  args: OptimisticEditArgs<T>,
): Promise<void> {
  const { table, id, patch, commit } = args;
  const before = await table.get(id);
  if (before) await table.update(id, patch as UpdateSpec<T>);
  try {
    await commit();
  } catch (err) {
    if (before) await table.put(before);
    throw err;
  }
}

interface OptimisticDeleteArgs<T extends Row> {
  table: Table<T, string>;
  id: string;
  commit: () => Promise<unknown>;
  /** Outros registos a remover em cascata (ex.: itens de um pedido). */
  cascade?: Array<{ table: Table<Row, string>; id: string }>;
}

/**
 * Remove do Dexie já (mais cascata), chama `commit()`, e em falha repõe tudo.
 */
export async function optimisticDelete<T extends Row>(
  args: OptimisticDeleteArgs<T>,
): Promise<void> {
  const { table, id, commit, cascade = [] } = args;

  const before = await table.get(id);
  const cascadeBefore = await Promise.all(
    cascade.map(async (c) => ({ c, row: await c.table.get(c.id) })),
  );

  if (before) await table.delete(id);
  await Promise.all(cascade.map((c) => c.table.delete(c.id)));

  try {
    await commit();
  } catch (err) {
    if (before) await table.put(before);
    await Promise.all(
      cascadeBefore.map(({ c, row }) => (row ? c.table.put(row) : Promise.resolve())),
    );
    throw err;
  }
}

/**
 * Create / ação de peso: exige rede; opcionalmente persiste já a resposta do
 * servidor na cache (com ids reais — não é um "temp id" que depois desaparece).
 */
export async function onlineCreate<T>(
  commit: () => Promise<T>,
  persist?: (result: T) => Promise<void>,
): Promise<T> {
  assertOnline();
  const result = await commit();
  if (persist) {
    try {
      await persist(result);
    } catch {
      /* o eco do realtime / catchUp trata; não falha a operação */
    }
  }
  return result;
}

/** Helpers de acesso às tabelas para os call-sites. */
export const tables = {
  groups: db.groups,
  trips: db.trips,
  orders: db.orders,
  items: db.items,
  splits: db.splits,
} as const;
