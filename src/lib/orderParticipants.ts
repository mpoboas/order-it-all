import type { Order, User } from './types';

export type OrderAudienceType = 'me' | 'several' | 'all';

const PB_FILES = 'https://pb-orderit.povoas.top/api/files/users';

export function getUserAvatarUrl(userId: string, avatarFile?: string): string | undefined {
  const file = avatarFile?.trim();
  if (!file || !userId) return undefined;
  return `${PB_FILES}/${userId}/${file}`;
}

export function deriveOrderUserName(
  participantIds: string[],
  members: User[],
  audienceType: OrderAudienceType
): string {
  if (audienceType === 'all') return 'Todos';
  const names = participantIds
    .map(id => members.find(m => m.id === id)?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) return 'Pedido';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export function resolveOrderParticipants(
  participantIds: string[],
  members: User[],
  expanded?: User[]
): User[] {
  return participantIds
    .map(id => expanded?.find(p => p.id === id) ?? members.find(m => m.id === id))
    .filter((u): u is User => Boolean(u));
}

export function getOrderAudienceSubtitle(
  participantIds: string[],
  members: User[],
  currentUserId: string,
  audienceType?: OrderAudienceType
): string {
  if (participantIds.length === 1 && participantIds[0] === currentUserId) {
    return 'A pedir para mim';
  }
  if (audienceType === 'me' && participantIds.length === 1) {
    const name = members.find(m => m.id === participantIds[0])?.name;
    return name ? `A pedir para ${name}` : 'A pedir para um membro';
  }
  const memberIds = members.map(m => m.id).sort().join(',');
  const selectedIds = [...participantIds].sort().join(',');
  if (audienceType === 'all' || (memberIds && selectedIds === memberIds)) {
    return 'A pedir para todos';
  }
  const names = participantIds
    .map(id => members.find(m => m.id === id)?.name)
    .filter(Boolean) as string[];
  if (names.length <= 3) return `A pedir para ${names.join(', ')}`;
  return `A pedir para ${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

export function inferAudienceType(
  participantIds: string[],
  members: User[],
  currentUserId: string
): OrderAudienceType {
  const memberIds = members.map(m => m.id);
  if (participantIds.length === 1 && participantIds[0] === currentUserId) {
    return 'me';
  }
  if (
    memberIds.length > 0 &&
    participantIds.length === memberIds.length &&
    memberIds.every(id => participantIds.includes(id))
  ) {
    return 'all';
  }
  return 'several';
}

function getMemberDisplayName(userId: string, members: User[]): string {
  return members.find(m => m.id === userId)?.name?.trim() || 'membro';
}

export interface OrderAudienceLabelOptions {
  /** Admin: "Só para Ana", "Para Ana e mais 2" instead of "ti" */
  namedPerspective?: boolean;
}

/** Compact label for order cards — no participant names */
export function getOrderAudienceShortLabel(
  participantIds: string[],
  members: User[],
  currentUserId: string,
  audienceType?: OrderAudienceType,
  options?: OrderAudienceLabelOptions
): string {
  const type = audienceType ?? inferAudienceType(participantIds, members, currentUserId);
  const named = options?.namedPerspective;
  const subjectName = named ? getMemberDisplayName(currentUserId, members) : null;

  if (type === 'me' || (participantIds.length === 1 && participantIds[0] === currentUserId)) {
    return named && subjectName ? `Só para ${subjectName}` : 'Só para ti';
  }

  const memberIds = members.map(m => m.id);
  const selectedIds = [...participantIds].sort().join(',');
  const allIds = [...memberIds].sort().join(',');
  if (type === 'all' || (memberIds.length && selectedIds === allIds)) {
    return 'Todo o grupo';
  }

  const includesMe = participantIds.includes(currentUserId);
  if (!includesMe) {
    return 'Para outros';
  }

  const otherCount = participantIds.filter(id => id !== currentUserId).length;
  if (named && subjectName) {
    if (otherCount === 1) return `Para ${subjectName} e mais 1`;
    return `Para ${subjectName} e mais ${otherCount}`;
  }
  if (otherCount === 1) return 'Para ti e mais 1';
  return `Para ti e mais ${otherCount}`;
}

export function orderVisibleToUser(order: Order, userId: string, userName: string): boolean {
  if (order.participants?.length) {
    return order.participants.includes(userId) || order.user === userId;
  }
  return order.user === userId || order.user_name === userName;
}

export function getOtherParticipants(order: Order, creatorId?: string): User[] {
  const expanded = order.expand?.participants || [];
  const creator = creatorId || order.user || order.expand?.user?.id;
  if (expanded.length) {
    return expanded.filter(p => p.id !== creator);
  }
  return [];
}

export function getSplitParticipantNames(
  order: Order,
  memberMap: Map<string, string>,
  allMemberNames: string[]
): string[] {
  const expanded = order.expand?.participants;
  if (expanded?.length) {
    const names = expanded.map(p => memberMap.get(p.id) || p.name).filter(Boolean);
    const memberIds = [...memberMap.keys()];
    if (
      order.participants?.length === memberIds.length &&
      memberIds.every(id => order.participants!.includes(id))
    ) {
      return allMemberNames;
    }
    return names;
  }
  if (order.user_name === 'Geral' || order.user_name === 'Todos') {
    return allMemberNames;
  }
  let displayName = order.user_name;
  const orderUserId = order.user || order.expand?.user?.id;
  if (orderUserId && memberMap.has(orderUserId)) {
    displayName = memberMap.get(orderUserId)!;
  }
  return [displayName];
}
