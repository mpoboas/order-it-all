import type { Split, SplitItem, User } from '@/lib/types';

// Split used in calculateSplitTotals

const STORAGE_PREFIX = 'split_guest_participant_';

export function buildSplitShareUrl(shareCode: string): string {
  if (typeof window === 'undefined') {
    return `/split/${shareCode}`;
  }
  return `${window.location.origin}/split/${shareCode}`;
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

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function findSuggestedParticipant(
  participants: string[],
  user: Pick<User, 'name' | 'email'> | null | undefined
): string | null {
  if (!user || participants.length === 0) return null;

  const candidates = [user.name, user.email].filter(Boolean) as string[];
  const emailLocal = user.email?.split('@')[0];
  if (emailLocal) candidates.push(emailLocal);

  for (const candidate of candidates) {
    const norm = normalizeName(candidate);
    const match = participants.find((p) => normalizeName(p) === norm);
    if (match) return match;
  }

  return null;
}

export function toggleItemParticipant(
  items: SplitItem[],
  itemIndex: number,
  participantName: string,
  include: boolean
): SplitItem[] {
  const next = items.map((item) => ({
    ...item,
    participants: [...item.participants],
  }));
  const item = next[itemIndex];
  if (!item) return items;

  if (include) {
    if (!item.participants.includes(participantName)) {
      item.participants.push(participantName);
    }
  } else {
    item.participants = item.participants.filter((p) => p !== participantName);
  }

  return next;
}

export function calculateSplitTotals(
  split: Pick<Split, 'participants' | 'items'>
): Record<string, number> {
  const totals: Record<string, number> = {};
  split.participants.forEach((p) => {
    totals[p] = 0;
  });
  split.items.forEach((item) => {
    if (item.participants.length > 0) {
      const share = item.price / item.participants.length;
      item.participants.forEach((p) => {
        if (totals[p] !== undefined) totals[p] += share;
      });
    }
  });
  return totals;
}

export function calculateExportGrandTotal(
  items: SplitItem[]
): number {
  return items.reduce(
    (sum, item) =>
      item.participants.length > 0 ? sum + item.price : sum,
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
    if (
      item.participants.length > 0 &&
      item.participants.includes(participantName)
    ) {
      return sum + item.price / item.participants.length;
    }
    return sum;
  }, 0);
}

export type PublicSplitPayload = Pick<
  Split,
  | 'id'
  | 'name'
  | 'description'
  | 'group_id'
  | 'participants'
  | 'items'
>;

export function toPublicSplitPayload(split: Split): PublicSplitPayload {
  return {
    id: split.id,
    name: split.name,
    description: split.description,
    group_id: split.group_id,
    participants: split.participants,
    items: split.items.map((item) => ({
      name: item.name,
      price: item.price,
      participants: [...item.participants],
    })),
  };
}
