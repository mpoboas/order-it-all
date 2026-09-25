import type { Group, Placeholder, Split, SplitItem, User } from '@/lib/types';
import { normalizeSplitRecord } from '@/lib/splitStatus';
import { getAdminPb } from '@/lib/pbAdmin';

// Link público de divisão: o visitante anónimo NÃO tem acesso direto a
// `splits` no PocketBase (regras em `pb/migrations/5_lock_legacy.js` — só
// membros). Tudo passa por `/api/splits/share/[code]`, que só aplica
// "entrar/sair de um item" e repartições do próprio visitante — nunca muda
// itens, preços ou o total (regra de produto: o total da despesa não pode
// mudar pelo link público). Por isso aqui lê-se e escreve-se como superuser.

/** Erro do write optimista quando a versão do split já mudou (outro escritor). */
export class SplitVersionConflictError extends Error {
  constructor() {
    super('split_version_conflict');
    this.name = 'SplitVersionConflictError';
  }
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

export async function getActiveSplitByShareCode(
  shareCode: string
): Promise<Split | null> {
  const pb = await getAdminPb();
  try {
    const record = await pb.collection('splits').getFirstListItem<Split>(
      pb.filter('share_code = {:code} && share_active = true', { code: shareCode })
    );
    return normalizeSplit(record);
  } catch {
    return null;
  }
}

export interface PublicParty {
  id: string;
  name: string;
}

/**
 * Nomes de todas as partes do grupo (membros + placeholders) para o visitante
 * anónimo do link resolver `split.participants`/`item.participants` (ids) em
 * texto. `groups`/`placeholders` não têm regra de leitura pública — por isso
 * autentica como super-utilizador (mesmo padrão de `/api/notify`). Só nome +
 * id; nada de email/avatar sai daqui.
 */
export async function getGroupPartiesForShare(groupId: string): Promise<PublicParty[]> {
  const adminPb = await getAdminPb();
  const [group, placeholders] = await Promise.all([
    adminPb.collection('groups').getOne<Group>(groupId, {
      expand: 'creator,admins,members',
    }),
    adminPb.collection('placeholders').getFullList<Placeholder>({
      filter: `group_id = "${groupId}"`,
    }),
  ]);

  const members: User[] = [];
  const seen = new Set<string>();
  const pushMember = (u?: User) => {
    if (u?.id && !seen.has(u.id)) {
      seen.add(u.id);
      members.push(u);
    }
  };
  pushMember(group.expand?.creator);
  group.expand?.admins?.forEach(pushMember);
  group.expand?.members?.forEach(pushMember);

  return [
    ...members.map((m) => ({ id: m.id, name: m.name || m.email || 'Sem nome' })),
    ...placeholders.map((p) => ({ id: p.id, name: p.name })),
  ];
}

/**
 * Escreve `items` com controlo de concorrência optimista. Como superuser, a
 * condição de versão da regra do PB (`@request.body.items_version >
 * items_version`, que continua a proteger as escritas dos membros) não se
 * aplica — por isso a versão é verificada aqui: relê o split imediatamente
 * antes de escrever e, se `items_version` já não for `expectedVersion`
 * (outro escritor passou entretanto), lança `SplitVersionConflictError` para o
 * chamador reler e repetir. Dentro do mesmo processo, `withLock` (na rota)
 * serializa; a janela reler→escrever entre instâncias diferentes é mínima.
 */
export async function updateSplitItems(
  splitId: string,
  items: Split['items'],
  expectedVersion: number
): Promise<Split> {
  const pb = await getAdminPb();
  const fresh = await pb.collection('splits').getOne<Split>(splitId, { fields: 'id,items_version' });
  if ((fresh.items_version ?? 0) !== expectedVersion) {
    throw new SplitVersionConflictError();
  }
  const record = await pb.collection('splits').update<Split>(splitId, {
    items,
    items_version: expectedVersion + 1,
  });
  return normalizeSplit(record);
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
