import PocketBase, { ClientResponseError } from 'pocketbase';
import type { Split, SplitItem } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';

const pb = new PocketBase(
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top'
);
// Sem isto, dois PATCH concorrentes ao mesmo split partilham a mesma
// request-key e o segundo cancela o primeiro ("The request was autocancelled").
pb.autoCancellation(false);

/** Erro do write optimista quando a versão do split já mudou (outro escritor). */
export class SplitVersionConflictError extends Error {
  constructor() {
    super('split_version_conflict');
    this.name = 'SplitVersionConflictError';
  }
}

export function escapeShareCode(code: string): string {
  return code.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeItems(items: unknown): SplitItem[] {
  if (Array.isArray(items)) return items as SplitItem[];
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeSplit(record: Split): Split {
  return normalizeSplitRecord({
    ...record,
    participants: Array.isArray(record.participants) ? record.participants : [],
    items: normalizeItems(record.items),
  });
}

/** Public PocketBase rules allow read when share_active + share_code match. */
export async function getActiveSplitByShareCode(
  shareCode: string
): Promise<Split | null> {
  try {
    const record = await pb.collection('splits').getFirstListItem<Split>(
      `share_code = "${escapeShareCode(shareCode)}" && share_active = true`
    );
    return normalizeSplit(record);
  } catch {
    return null;
  }
}

/**
 * Escreve `items` com controlo de concorrência optimista: só passa se o
 * `items_version` guardado ainda for `expectedVersion` (regra de API do PB:
 * `@request.body.items_version > items_version`). Se outro escritor já bumpou,
 * o PB devolve 403/400 → lançamos `SplitVersionConflictError` para o chamador
 * reler e repetir.
 */
export async function updateSplitItems(
  splitId: string,
  items: Split['items'],
  expectedVersion: number
): Promise<Split> {
  try {
    const record = await pb.collection('splits').update<Split>(splitId, {
      items,
      items_version: expectedVersion + 1,
    });
    return normalizeSplit(record);
  } catch (error) {
    // O PocketBase devolve 404 (não 403) quando a regra de Update falha — para
    // não revelar se o registo existe. Aqui já sabemos que existe (lemo-lo
    // agora mesmo), por isso um 404/403/400 = conflito de versão.
    if (
      error instanceof ClientResponseError &&
      (error.status === 404 || error.status === 403 || error.status === 400)
    ) {
      throw new SplitVersionConflictError();
    }
    throw error;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read → aplica → write, repetindo enquanto houver conflito de versão. A
 * serialização real é o único writer do SQLite + a regra de versão do PB, por
 * isso funciona com qualquer número de instâncias Next.
 *
 * `apply` recebe o split fresco e devolve os `items` a gravar, ou `null` para
 * abortar sem escrever (ex.: a intenção já estava aplicada).
 */
export async function withSplitItemsOCC(
  shareCode: string,
  apply: (split: Split) => Split['items'] | null,
  maxAttempts = 6
): Promise<Split> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const split = await getActiveSplitByShareCode(shareCode);
    if (!split) throw new Error('not_found');

    const items = apply(split);
    if (items === null) return split;

    try {
      return await updateSplitItems(split.id, items, split.items_version ?? 0);
    } catch (error) {
      lastError = error;
      if (error instanceof SplitVersionConflictError) {
        await sleep(15 + Math.random() * 50 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new SplitVersionConflictError();
}
