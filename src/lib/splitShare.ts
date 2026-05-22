import type { Split, SplitItem, User } from '@/lib/types';

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
  'id' | 'name' | 'description' | 'group_id' | 'participants' | 'items'
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
