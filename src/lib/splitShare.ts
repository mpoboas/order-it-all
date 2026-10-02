import { computeParticipantAmount, getActiveParticipants } from '@/lib/splitItemAllocation';
import type { PartyResolver } from '@/lib/parties';
import type { Split, SplitItem, User } from '@/lib/types';

const STORAGE_PREFIX = 'split_guest_participant_';
const PARTICIPANTS_EXPANDED_KEY = 'split_participants_expanded';

export function buildSplitShareUrl(shareCode: string): string {
  if (typeof window === 'undefined') {
    return `/split/${shareCode}`;
  }
  return `${window.location.origin}/split/${shareCode}`;
}

export function buildSplitShareMessage(splitName: string, shareUrl: string): string {
  return `Estás convidado a marcar os itens em que participaste na divisão ${splitName}. Abre o link, escolhe o teu nome e confirma: ${shareUrl}`;
}

export function getStoredParticipant(shareCode: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${shareCode}`);
  } catch {
    return null;
  }
}

export function setStoredParticipant(shareCode: string, name: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${shareCode}`, name);
  } catch {
    /* ignore */
  }
}

export function clearStoredParticipant(shareCode: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${shareCode}`);
  } catch {
    /* ignore */
  }
}

export function getStoredParticipantsExpanded(
  defaultValue = true
): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(PARTICIPANTS_EXPANDED_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

export function setStoredParticipantsExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PARTICIPANTS_EXPANDED_KEY, String(expanded));
  } catch {
    /* ignore */
  }
}

export type ToggleItemParticipantResult =
  | { ok: true; items: SplitItem[] }
  | { ok: false; reason: 'locked' | 'invalid_index' };

export function toggleItemParticipant(
  items: SplitItem[],
  itemIndex: number,
  participantName: string,
  include: boolean,
  options?: { bypassLock?: boolean }
): ToggleItemParticipantResult {
  const next = items.map((item) => ({
    ...item,
    participants: [...item.participants],
  }));
  const item = next[itemIndex];
  if (!item) return { ok: false, reason: 'invalid_index' };

  // Item trancado = roster congelado: ninguém entra nem sai (só o admin, via
  // editor do split / `bypassLock`).
  if (item.locked === true && !options?.bypassLock) {
    return { ok: false, reason: 'locked' };
  }

  if (include) {
    if (!item.participants.includes(participantName)) {
      item.participants.push(participantName);
    }
  } else {
    item.participants = item.participants.filter((p) => p !== participantName);
  }

  return { ok: true, items: next };
}

export function calculateSplitTotals(
  split: Pick<Split, 'participants' | 'items'>
): Record<string, number> {
  const totals: Record<string, number> = {};
  split.participants.forEach((p) => {
    totals[p] = 0;
  });
  split.items.forEach((item) => {
    const active = getActiveParticipants(item);
    if (active.length === 0) return;
    active.forEach((p) => {
      if (totals[p] === undefined) return;
      totals[p] += computeParticipantAmount(item, p);
    });
  });
  return totals;
}

export function calculateExportGrandTotal(
  items: SplitItem[]
): number {
  return items.reduce(
    (sum, item) =>
      getActiveParticipants(item).length > 0 ? sum + item.price : sum,
    0
  );
}

/** Label for how the current participant shares an item (null if they are not on it). */
export function getItemSplitLabel(
  itemParticipants: string[],
  me: string,
  allParticipants: string[]
): string | null {
  if (!me || !itemParticipants.includes(me)) return null;

  const total = allParticipants.length;
  if (total === 0) return null;

  if (itemParticipants.length === 1) return 'Apenas eu';

  if (
    itemParticipants.length === total &&
    allParticipants.every((p) => itemParticipants.includes(p))
  ) {
    return 'Dividir por todos';
  }

  const others = itemParticipants.filter((p) => p !== me).length;
  if (others <= 0) return 'Apenas eu';
  return `Dividir com mais ${others}`;
}

export function calculateParticipantTotal(
  items: SplitItem[],
  participantName: string
): number {
  return items.reduce((sum, item) => {
    if (!getActiveParticipants(item).includes(participantName)) {
      return sum;
    }
    return sum + computeParticipantAmount(item, participantName);
  }, 0);
}

/** Nome de uma parte (membro ou placeholder) — é tudo o que um visitante
 *  anónimo do link precisa para ver quem é quem (nunca email/avatar). */
export interface PublicParty {
  id: string;
  name: string;
}

export type PublicSplitPayload = Pick<
  Split,
  | 'id'
  | 'name'
  | 'description'
  | 'group_id'
  | 'status'
  | 'participants'
  | 'items'
  | 'allowed_modes'
> & {
  /** `participants`/`item.participants`/`allocations` são ids de parte —
   *  resolve-os para nome através daqui (ver `src/lib/parties.ts` no lado
   *  autenticado, e `partyNameById` abaixo para o lado público). */
  parties: PublicParty[];
};

export function toPublicSplitPayload(
  split: Split,
  parties: PublicParty[]
): PublicSplitPayload {
  return {
    id: split.id,
    name: split.name,
    description: split.description,
    group_id: split.group_id,
    status: split.status,
    participants: split.participants,
    allowed_modes: split.allowed_modes ?? [],
    parties,
    items: split.items.map((item) => ({
      name: item.name,
      price: item.price,
      participants: [...item.participants],
      locked: item.locked === true,
      split_mode: item.split_mode,
      allocations: item.allocations ? { ...item.allocations } : undefined,
    })),
  };
}

/** Nome de uma parte a partir da lista `parties` do payload público — usa-se
 *  no `/split/[shareCode]` (não autenticado, sem acesso a `parties.ts`/Dexie). */
export function partyNameById(id: string, parties: PublicParty[]): string {
  return parties.find((p) => p.id === id)?.name ?? 'Alguém';
}

/** `PartyResolver` (ver `src/lib/parties.ts`) para o lado público — nunca há
 *  avatar real aqui (o visitante anónimo só recebe nomes, nunca ficheiros de
 *  avatar de outras pessoas). */
export function publicPartyResolver(parties: PublicParty[]): PartyResolver {
  return {
    label: (id) => partyNameById(id, parties),
    avatarUrl: () => undefined,
  };
}

/**
 * Versão do `findMyPartyId` (`src/lib/parties.ts`) para o payload público —
 * aqui não há `kind`/`claimedBy` (o visitante anónimo só recebe id+nome), por
 * isso não tenta a via do placeholder já reclamado, só o id direto e a
 * correspondência de nome (ajuda um utilizador com conta a encontrar-se na
 * lista antes de o organizador o adicionar como membro de verdade).
 */
export function findMyPublicPartyId(
  participantIds: string[],
  parties: PublicParty[],
  user: Pick<User, 'id' | 'name' | 'email'> | null | undefined
): string | null {
  if (!user) return null;
  if (participantIds.includes(user.id)) return user.id;

  const candidates = [user.name, user.email]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.trim().toLowerCase());
  const emailLocal = user.email?.split('@')[0]?.trim().toLowerCase();
  if (emailLocal) candidates.push(emailLocal);

  for (const id of participantIds) {
    const name = parties.find((p) => p.id === id)?.name;
    if (name && candidates.includes(name.trim().toLowerCase())) return id;
  }
  return null;
}

/**
 * Regra de produto do link público: quem entra pelo link só escolhe o que
 * consumiu (entrar/sair de itens, repartir a sua parte) — nunca adiciona ou
 * apaga itens nem muda nomes/preços, para o total da despesa não mudar sem um
 * membro (que é obrigado a reatribuir quem pagou). A rota verifica isto antes
 * de gravar, como segunda linha de defesa contra um bug na lógica de repartição.
 */
export function onlyParticipationChanged(before: SplitItem[], after: SplitItem[]): boolean {
  if (before.length !== after.length) return false;
  return before.every(
    (item, i) => item.name === after[i].name && Math.round(item.price * 100) === Math.round(after[i].price * 100),
  );
}
