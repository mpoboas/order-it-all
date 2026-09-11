import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { computeParticipantAmount, getActiveParticipants } from '@/lib/splitItemAllocation';
import type { Group, Split, SplitItem, User } from '@/lib/types';

// Split used in calculateSplitTotals

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

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function participantDisplayName(user: Pick<User, 'name' | 'email'>): string {
  return (user.name || user.email || '').trim();
}

export function collectGroupMembers(
  group: Pick<Group, 'expand'> | null | undefined
): User[] {
  if (!group?.expand) return [];

  const people: User[] = [];
  if (group.expand.creator) people.push(group.expand.creator);
  if (group.expand.admins) people.push(...group.expand.admins);
  if (group.expand.members) people.push(...group.expand.members);

  const seenIds = new Set<string>();
  const members: User[] = [];

  for (const member of people) {
    if (!member?.id || seenIds.has(member.id)) continue;
    seenIds.add(member.id);
    members.push(member);
  }

  return members;
}

export function collectGroupParticipantNames(
  group: Pick<Group, 'expand'> | null | undefined
): string[] {
  const seenNames = new Set<string>();
  const names: string[] = [];

  for (const member of collectGroupMembers(group)) {
    const label = participantDisplayName(member);
    if (!label) continue;

    const key = normalizeName(label);
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    names.push(label);
  }

  return names;
}

function memberNameCandidates(
  user: Pick<User, 'name' | 'email'>
): string[] {
  const candidates = [user.name, user.email].filter(Boolean) as string[];
  const emailLocal = user.email?.split('@')[0];
  if (emailLocal) candidates.push(emailLocal);
  return candidates;
}

export function resolveGroupMemberForParticipant(
  participantName: string,
  group: Pick<Group, 'expand'> | null | undefined
): User | null {
  const key = normalizeName(participantName);
  if (!key) return null;

  for (const member of collectGroupMembers(group)) {
    for (const candidate of memberNameCandidates(member)) {
      if (normalizeName(candidate) === key) return member;
    }
    if (normalizeName(participantDisplayName(member)) === key) return member;
  }

  return null;
}

export function getParticipantAvatarUrl(
  participantName: string,
  group: Pick<Group, 'expand'> | null | undefined
): string | undefined {
  const member = resolveGroupMemberForParticipant(participantName, group);
  if (!member) return undefined;
  return getUserAvatarUrl(member.id, member.avatar);
}

export function isGroupMemberInParticipants(
  member: User,
  participants: string[],
  group: Pick<Group, 'expand'> | null | undefined
): boolean {
  const label = participantDisplayName(member);
  if (!label) return false;

  return participants.some(
    (participant) =>
      normalizeName(participant) === normalizeName(label) ||
      resolveGroupMemberForParticipant(participant, group)?.id === member.id
  );
}

export function listGroupMembersNotInParticipants(
  group: Pick<Group, 'expand'> | null | undefined,
  participants: string[]
): User[] {
  return collectGroupMembers(group).filter(
    (member) => !isGroupMemberInParticipants(member, participants, group)
  );
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
>;

export function toPublicSplitPayload(split: Split): PublicSplitPayload {
  return {
    id: split.id,
    name: split.name,
    description: split.description,
    group_id: split.group_id,
    status: split.status,
    participants: split.participants,
    allowed_modes: split.allowed_modes ?? [],
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
